import { describe, it, expect, vi, afterAll } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { detect } from 'tinyld'

// Supabase is the only thing replaced: `settings` reads still reach the real project (that is
// where production keeps the API keys and provider settings), every write is swallowed. No
// model call is mocked. See src/test/real-ai/supabase-guard.ts.
vi.mock('@/lib/supabase/server', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/supabase/server')>()
  const { guardAdminClient } = await import('@/test/real-ai/supabase-guard')
  return { ...real, createAdminClient: () => guardAdminClient(real.createAdminClient) }
})

import { analyzeIrisDual } from '@/lib/claude/analyze-dual'
import { sanitizeJsonControlCharacters, describeJsonSyntaxError } from '@/lib/claude/json-repair'
import { parseImageDataUrl } from '@/lib/claude/images'
import { shouldEnhanceWithJyotish, enhanceEmotionalFieldWithJyotish } from '@/lib/claude/enhance-emotional-field'
import { rewriteReportForClient, firstNameFrom } from '@/lib/client/writing-pipeline'
import { getClientProviders, getAnthropicApiKey } from '@/lib/ai/get-provider'
import { createAdminClient } from '@/lib/supabase/server'
import { detectsCorrectLanguage } from '@/app/api/client/upload/language-check'
import { reportContentSchema } from '@/lib/validators/report'
import { withTimeout } from '@/lib/utils'
import { REPORT_SECTION_KEYS, type ReportContent } from '@/types/report'
import type { AnalysisRequest } from '@/types/claude'
import type { PaymentTier } from '@/types/client-analysis'
import {
  runWithCallContext,
  recordedCalls,
  budgetViolations,
  formatCallTable,
  type RecordedCall,
} from '@/test/real-ai/instrument'
import { clientUploadDataUrl } from '@/test/real-ai/iris-fixture'
import { swallowedTableAccess } from '@/test/real-ai/supabase-guard'

// Production ceilings (src/app/api/client/upload/route.ts, internal/stage2/route.ts): stage 1
// and stage 2 each have a 270s withTimeout inside a 300s Vercel function, and the rewrite has
// its own 200s. A run that only just fits locally will not fit on a slow day in production,
// so each stage must finish inside 80% of its ceiling.
const MARGIN = 0.8
const STAGE1_CEILING_MS = 270_000
const STAGE2_CEILING_MS = 270_000
const REWRITE_CEILING_MS = 200_000

const LANGS = (process.env.REAL_AI_LANGS ?? 'es,en,de').split(',').map((s) => s.trim()).filter(Boolean)
const TIERS = (process.env.REAL_AI_TIERS ?? 'premium_2990').split(',').map((s) => s.trim()).filter(Boolean) as PaymentTier[]

// Fictional intake rows. Nothing here is a real client.
const INTAKE: Record<string, { full_name: string; main_complaint: string }> = {
  es: { full_name: 'Lucía Prueba', main_complaint: 'Cansancio constante, hinchazón después de comer y dificultad para dormir.' },
  en: { full_name: 'Laura Test', main_complaint: 'Constant tiredness, bloating after meals and trouble sleeping.' },
  de: { full_name: 'Lena Test', main_complaint: 'Ständige Müdigkeit, Blähungen nach dem Essen und Schlafprobleme.' },
}
const BIRTH = { date_of_birth: '1984-03-15', country_of_birth: 'Spain', city_of_birth: 'Valencia', time_of_day: 'morning' }
const QUESTIONNAIRE = {
  digestive: { bloating: true, constipation: true },
  nervous: { insomnia: true, chronic_stress: true },
  endocrine: { excessive_fatigue: true },
}

async function openaiKeyAvailable(): Promise<boolean> {
  const { data } = await createAdminClient().from('settings').select('key, value').in('key', ['openai_api_key'])
  const fromDb = (data as Array<{ value: string | null }> | null)?.[0]?.value
  return Boolean(fromDb || process.env.OPENAI_API_KEY)
}

const keysAvailable = Boolean(await getAnthropicApiKey()) && (await openaiKeyAvailable())

interface RunSummary {
  tier: string
  lang: string
  stage1Ms: number | null
  stage2Ms: number | null
  rewriteMs: number | null
  directParse: Record<string, boolean>
  violations: string[]
}
const summaries: RunSummary[] = []

function notOneCompleteReport(text: string): string | null {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  let value: unknown
  try {
    value = JSON.parse(sanitizeJsonControlCharacters(body))
  } catch (error) {
    return describeJsonSyntaxError(body, error as SyntaxError).slice(0, 300)
  }
  const valid = reportContentSchema.safeParse(value)
  return valid.success ? null : `fails reportContentSchema: ${valid.error.message.slice(0, 300)}`
}

function secs(ms: number | null): string {
  return ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)}s`
}

function languageOf(report: ReportContent): string {
  return detect(REPORT_SECTION_KEYS.map((k) => report[k] ?? '').join('\n'))
}

function writeRunArtifact(summary: RunSummary, calls: RecordedCall[]) {
  const dir = path.resolve(process.cwd(), 'test-results/real-ai')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${summary.tier}-${summary.lang}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ ...summary, calls }, null, 2))
  return file
}

if (!keysAvailable) {
  describe('real-AI client pipeline', () => {
    it('needs real Anthropic and OpenAI keys', () => {
      if (process.env.REAL_AI_ALLOW_SKIP === '1') return
      throw new Error(
        'No Anthropic and/or OpenAI key found (settings table or ANTHROPIC_API_KEY / OPENAI_API_KEY). ' +
          'This suite exists to make real model calls; it refuses to pass without them. ' +
          'Set REAL_AI_ALLOW_SKIP=1 to skip on purpose.',
      )
    })
  })
} else {
  const suite = process.env.REAL_AI_SEQUENTIAL === '1' ? describe : describe.concurrent

  for (const tier of TIERS) {
    suite(`real-AI client pipeline, ${tier}`, () => {
      for (const lang of LANGS) {
        it(`${lang}: stage 1 + stage 2 with real models stay inside token and time budgets`, async () => {
          const intake = INTAKE[lang] ?? INTAKE.en
          const violations: string[] = []
          const summary: RunSummary = { tier, lang, stage1Ms: null, stage2Ms: null, rewriteMs: null, directParse: {}, violations }

          const right = await clientUploadDataUrl()
          const left = await clientUploadDataUrl()
          const rightImage = parseImageDataUrl(right.dataUrl)
          const leftImage = parseImageDataUrl(left.dataUrl)
          console.log(`[real-ai ${tier}/${lang}] iris fixture: ${right.crop}`)

          // Built field-for-field like the upload route builds it from a client_analyses row.
          const analysisRequest: AnalysisRequest = {
            sessionId: '',
            patientId: '',
            rightIrisBase64: rightImage.data,
            leftIrisBase64: leftImage.data,
            rightIrisMediaType: rightImage.mediaType,
            leftIrisMediaType: leftImage.mediaType,
            patientData: {
              full_name: intake.full_name,
              date_of_birth: BIRTH.date_of_birth,
              gender: null,
              general_history: '',
              symptoms: intake.main_complaint,
              practitioner_notes: '',
            },
            health_questionnaire: QUESTIONNAIRE,
          }

          // ---- Stage 1: exactly what POST /api/client/upload runs ----
          let report: ReportContent | null = null
          await runWithCallContext({ lang, tier, stage: 'stage1' }, async () => {
            const startedAt = Date.now()
            try {
              const providers = await getClientProviders(tier)
              const result = await withTimeout(
                analyzeIrisDual(analysisRequest, lang, { providers, forceLanguage: true }),
                STAGE1_CEILING_MS,
                'Analysis timed out after 270s',
              )
              if ('code' in result) violations.push(`stage 1 returned an error the client would see: Analysis failed: ${result.message}`)
              else report = result
            } catch (error) {
              violations.push(`stage 1 threw: ${error instanceof Error ? error.message : String(error)}`)
            }
            summary.stage1Ms = Date.now() - startedAt
          })

          if (summary.stage1Ms! > STAGE1_CEILING_MS * MARGIN) {
            violations.push(`stage 1 took ${secs(summary.stage1Ms)}, over ${MARGIN * 100}% of its ${STAGE1_CEILING_MS / 1000}s ceiling`)
          }

          // The Claude leg and the synthesis must each be ONE complete report, with no recovery.
          // A reply that only parses after picking an object out of surrounding prose is the
          // 2026-10-07 failure shape (JSON, "Wait, let me...", JSON again), and the next slip of
          // that kind may leave no complete object at all ("Analysis failed: Unexpected
          // non-whitespace character after JSON", production token 191e1f53).
          await new Promise((r) => setTimeout(r, 50))
          for (const call of recordedCalls({ lang, tier, stage: 'stage1' })) {
            if (call.label !== 'synthesis' && call.label !== 'claude-leg') continue
            if (!call.schemaConstrained) violations.push(`stage1.${call.label} was sent without output_config.format json_schema`)
            if (call.error || call.stopReason === 'max_tokens') continue
            const problem = notOneCompleteReport(call.text)
            summary.directParse[call.label] = problem === null
            if (problem) violations.push(`stage1.${call.label} output is not one complete report on its own: ${problem}`)
          }

          if (report) {
            const stage1Report: ReportContent = report
            const valid = reportContentSchema.safeParse(stage1Report)
            if (!valid.success) violations.push(`stage 1 report fails reportContentSchema: ${valid.error.message.slice(0, 300)}`)
            if (!detectsCorrectLanguage(stage1Report.section_1_general_terrain, lang)) {
              violations.push(`stage 1 section_1 is not in ${lang} (detected ${detect(stage1Report.section_1_general_terrain)})`)
            }
            if (languageOf(stage1Report) !== lang) violations.push(`stage 1 report reads as ${languageOf(stage1Report)}, expected ${lang}`)

            // ---- Stage 2: exactly what POST /api/client/internal/stage2 runs ----
            let clientReport: ReportContent | null = null
            await runWithCallContext({ lang, tier, stage: 'stage2' }, async () => {
              const startedAt = Date.now()
              try {
                await withTimeout(
                  (async () => {
                    let enhanced = stage1Report
                    if (tier === 'premium_2990' && shouldEnhanceWithJyotish(BIRTH)) {
                      enhanced = await enhanceEmotionalFieldWithJyotish(stage1Report, 'Client', BIRTH, lang)
                    }
                    const rewriteStartedAt = Date.now()
                    try {
                      clientReport = await withTimeout(
                        rewriteReportForClient(enhanced, lang, firstNameFrom(intake.full_name)),
                        REWRITE_CEILING_MS,
                        'rewrite_timeout_exceeded',
                      )
                    } finally {
                      summary.rewriteMs = Date.now() - rewriteStartedAt
                    }
                  })(),
                  STAGE2_CEILING_MS,
                  'Stage 2 timed out after 270s',
                )
              } catch (error) {
                violations.push(`stage 2 threw (client sees 'No hemos podido completar tu análisis' after 3 attempts): ${error instanceof Error ? error.message : String(error)}`)
              }
              summary.stage2Ms = Date.now() - startedAt
            })

            if (summary.stage2Ms! > STAGE2_CEILING_MS * MARGIN) {
              violations.push(`stage 2 took ${secs(summary.stage2Ms)}, over ${MARGIN * 100}% of its ${STAGE2_CEILING_MS / 1000}s ceiling`)
            }
            if (summary.rewriteMs !== null && summary.rewriteMs > REWRITE_CEILING_MS * MARGIN) {
              violations.push(`stage 2 rewrite took ${secs(summary.rewriteMs)}, over ${MARGIN * 100}% of its ${REWRITE_CEILING_MS / 1000}s ceiling`)
            }
            await new Promise((r) => setTimeout(r, 50))
            for (const call of recordedCalls({ lang, tier, stage: 'stage2' })) {
              if (call.label.startsWith('writer-') && !call.schemaConstrained) {
                violations.push(`stage2.${call.label} was sent without output_config.format json_schema`)
              }
            }

            if (clientReport) {
              const finished: ReportContent = clientReport
              for (const key of REPORT_SECTION_KEYS) {
                if (typeof finished[key] !== 'string' || finished[key].trim().length === 0) {
                  violations.push(`client report is missing ${key}`)
                }
              }
              if (!detectsCorrectLanguage(finished.section_1_general_terrain, lang)) {
                violations.push(`client section_1 is not in ${lang} (detected ${detect(finished.section_1_general_terrain)})`)
              }
              if (languageOf(finished) !== lang) violations.push(`client report reads as ${languageOf(finished)}, expected ${lang}`)
            }
          } else {
            violations.push('stage 2 not run: stage 1 produced no report')
          }

          await new Promise((r) => setTimeout(r, 50))
          const calls = recordedCalls({ lang, tier })
          violations.push(...budgetViolations(calls))

          summaries.push(summary)
          const artifact = writeRunArtifact(summary, calls)
          const table = formatCallTable(calls)
          const timing = `stage 1 ${secs(summary.stage1Ms)} (limit ${(STAGE1_CEILING_MS * MARGIN) / 1000}s), stage 2 ${secs(summary.stage2Ms)} (limit ${(STAGE2_CEILING_MS * MARGIN) / 1000}s), rewrite ${secs(summary.rewriteMs)} (limit ${(REWRITE_CEILING_MS * MARGIN) / 1000}s)`
          console.log(`\n[real-ai ${tier}/${lang}] ${timing}\n${table}\nartifact: ${artifact}\n`)

          expect(violations, `\n[${tier}/${lang}] ${timing}\n${table}\nfull model outputs: ${artifact}\n`).toEqual([])
        })
      }
    })
  }

  afterAll(() => {
    const calls = recordedCalls()
    const byModel = new Map<string, { calls: number; input: number; output: number }>()
    for (const c of calls) {
      const entry = byModel.get(c.model) ?? { calls: 0, input: 0, output: 0 }
      entry.calls++
      entry.input += c.inputTokens ?? 0
      entry.output += c.outputTokens ?? 0
      byModel.set(c.model, entry)
    }
    const usage = [...byModel.entries()].map(([m, u]) => `  ${m}: ${u.calls} calls, ${u.input} input tokens, ${u.output} output tokens`).join('\n')
    const runs = summaries
      .map((s) => {
        const direct = Object.entries(s.directParse).map(([label, ok]) => `${label} ${ok ? 'parsed' : 'NOT parsed'}`).join(', ') || 'no stage-1 replies'
        return `  ${s.tier}/${s.lang}: stage 1 ${secs(s.stage1Ms)} (${direct}), stage 2 ${secs(s.stage2Ms)} (rewrite ${secs(s.rewriteMs)}), ${s.violations.length} violation(s)`
      })
      .join('\n')
    console.log(`\n[real-ai] runs:\n${runs}\n[real-ai] token usage:\n${usage}\n[real-ai] swallowed DB writes: ${swallowedTableAccess.join(', ') || 'none'}\n`)
  })
}
