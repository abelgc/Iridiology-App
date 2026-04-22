import { getBothProviders, getAIProvider } from '@/lib/ai/get-provider'
import { getStandardAnalysisSystemPrompt } from './prompts'
import { buildPatientContext } from './context'
import { buildUserPrompt } from './analyze'
import { parseReportResponse } from './parse'
import type { ReportContent } from '@/types/report'
import type { AnalysisError } from './analyze'
import type { AnalysisRequest } from '@/types/claude'

export async function analyzeIrisDual(
  request: AnalysisRequest,
  language: 'en' | 'es' = 'es',
): Promise<ReportContent | AnalysisError> {
  const providers = await getBothProviders()

  // If both keys aren't configured, fall back to single provider
  if (!providers) {
    const { analyzeIris } = await import('./analyze')
    return analyzeIris(request, language)
  }

  const { anthropic, openai } = providers

  const images = [
    { data: request.rightIrisBase64, mediaType: 'image/jpeg' as const },
    { data: request.leftIrisBase64, mediaType: 'image/jpeg' as const },
  ]

  const patientContext = await buildPatientContext(request.patientId)
  const userPrompt = buildUserPrompt(
    request,
    patientContext.previousReportSummary,
    patientContext.practitionerCorrections,
    request.health_questionnaire,
  )
  const systemPrompt = getStandardAnalysisSystemPrompt(language)

  console.log('[analyzeIrisDual] running Claude + GPT-4o in parallel...')

  const [claudeResult, openaiResult] = await Promise.allSettled([
    anthropic.complete({ systemPrompt, userText: userPrompt, images, maxTokens: 4096 }),
    openai.complete({ systemPrompt, userText: userPrompt, images, maxTokens: 4096 }),
  ])

  // Claude failed — hard error
  if (claudeResult.status === 'rejected') {
    console.error('[analyzeIrisDual] Claude failed:', claudeResult.reason)
    return { code: 'analysis_failed', message: claudeResult.reason?.message ?? 'Claude analysis failed' }
  }

  // OpenAI failed — degrade gracefully to Claude only
  if (openaiResult.status === 'rejected') {
    console.warn('[analyzeIrisDual] GPT-4o failed, using Claude only:', openaiResult.reason)
    const parsed = parseReportResponse(claudeResult.value.text)
    if ('code' in parsed) return { code: 'analysis_failed', message: parsed.message }
    return parsed
  }

  console.log('[analyzeIrisDual] both complete, synthesising...')

  // Synthesis: Claude receives both outputs and produces the definitive report.
  // OpenAI is mined for bold clinical assertions only — not iris descriptions.
  const synthesisPrompt = `You performed two independent iris analyses of the same patient. Produce the definitive clinical report.

=== ANALYSIS A (YOUR OWN — structural and stylistic foundation) ===
${claudeResult.value.text}

=== ANALYSIS B (GPT-4o — mine for bold clinical assertions only) ===
${openaiResult.value.text}

=== SYNTHESIS INSTRUCTIONS ===
1. Start from Analysis A. Its JSON structure, writing style, and clinical format are correct.
2. From Analysis B, extract ONLY statements that are:
   - A specific, named clinical finding or assertion ("hepatic congestion", "adrenal stress markers", "lymphatic stasis in zone 4")
   - Absent or understated in Analysis A
   - A clinical claim — NOT a visual iris description ("the collarette is slightly irregular" = discard)
3. Integrate extracted findings into the appropriate sections of Analysis A, phrased in your voice.
4. Where both analyses agree on a finding, state it with stronger confidence.
5. Where they contradict, keep Analysis A's position and note the discrepancy in one clause.
6. Every sentence in the final report must carry clinical value. Remove padding.
7. Output ONLY the final JSON. No preamble, no commentary, no markdown fences.`

  const synthesisResponse = await anthropic.complete({
    systemPrompt: `You are a senior clinical iridologist producing a definitive iris analysis report. Be direct. Every sentence must make a clinical claim. Write in ${language === 'en' ? 'English' : 'Spanish'}.`,
    userText: synthesisPrompt,
    images: [],
    maxTokens: 4096,
  })

  const parsed = parseReportResponse(synthesisResponse.text)
  if ('code' in parsed) {
    // Synthesis failed to parse — fall back to Claude's standalone result
    console.warn('[analyzeIrisDual] synthesis parse failed, falling back to Claude-only result')
    const claudeParsed = parseReportResponse(claudeResult.value.text)
    if ('code' in claudeParsed) return { code: 'analysis_failed', message: claudeParsed.message }
    return claudeParsed
  }

  console.log('[analyzeIrisDual] synthesis complete ✓')
  return parsed
}
