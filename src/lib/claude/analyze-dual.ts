import { getBothProviders, getAIProvider } from '@/lib/ai/get-provider'
import { isNonRetryableAIError } from '@/lib/ai/errors'
import type { AnthropicProvider } from '@/lib/ai/anthropic-provider'
import type { OpenAIProvider } from '@/lib/ai/openai-provider'
import type { AIProvider, CompletionRequest, CompletionResponse } from '@/lib/ai/types'
import { getStandardAnalysisSystemPrompt } from './prompts'
import { buildPatientContext } from './context'
import { buildUserPrompt } from './analyze'
import { parseReportResponse } from './parse'
import type { ReportContent } from '@/types/report'
import type { AnalysisError } from './analyze'
import type { AnalysisRequest } from '@/types/claude'

/**
 * Wraps provider.complete() with a single truncation-retry: if the response stops for
 * `max_tokens`, retries once at `retryMaxTokens`. If still truncated, throws a
 * `response_too_long:`-tagged Error (matching this app's existing failure_reason convention —
 * see writing-pipeline.ts) instead of returning text guaranteed to fail JSON parsing.
 */
async function completeWithTruncationGuard(
  provider: AIProvider,
  request: CompletionRequest,
  retryMaxTokens: number,
): Promise<CompletionResponse> {
  const response = await provider.complete(request)
  if (response.stopReason !== 'max_tokens') return response

  const retryResponse = await provider.complete({ ...request, maxTokens: retryMaxTokens })
  if (retryResponse.stopReason === 'max_tokens') {
    throw new Error(
      `response_too_long: response still truncated after increasing token limit to ${retryMaxTokens}`,
    )
  }
  return retryResponse
}

export interface DualAnalysisOptions {
  providers?: { anthropic: AnthropicProvider; openai: OpenAIProvider }
  forceLanguage?: boolean
}

export async function analyzeIrisDual(
  request: AnalysisRequest,
  language: string = 'en',
  options: DualAnalysisOptions = {},
): Promise<ReportContent | AnalysisError> {
  const { forceLanguage = false } = options
  const providers = options.providers ?? (await getBothProviders())

  if (!providers) {
    const { analyzeIris } = await import('./analyze')
    return analyzeIris(request, language, undefined, forceLanguage)
  }

  const { anthropic, openai } = providers

  const images = [
    { data: request.rightIrisBase64, mediaType: request.rightIrisMediaType ?? 'image/jpeg' },
    { data: request.leftIrisBase64, mediaType: request.leftIrisMediaType ?? 'image/jpeg' },
  ]

  const patientContext = await buildPatientContext(request.patientId)
  const userPrompt = buildUserPrompt(
    request,
    patientContext.previousReportSummary,
    patientContext.practitionerCorrections,
    request.health_questionnaire,
  )
  let systemPrompt = getStandardAnalysisSystemPrompt(language)
  if (forceLanguage) {
    systemPrompt +=
      '\n\nCRITICAL OVERRIDE: The ENTIRE response, every JSON value, every word MUST be written in the language specified above. Do not write a single word in any other language. This is a hard requirement.'
  }

  console.log('[analyzeIrisDual] running Claude + GPT-4o in parallel...')
  const dualStartedAt = Date.now()

  const [claudeResult, openaiResult] = await Promise.allSettled([
    completeWithTruncationGuard(anthropic, { systemPrompt, userText: userPrompt, images, maxTokens: 8192 }, 12288),
    completeWithTruncationGuard(openai, { systemPrompt, userText: userPrompt, images, maxTokens: 8192 }, 12288),
  ])

  console.log(`[analyzeIrisDual] parallel legs settled in ${Date.now() - dualStartedAt}ms`)

  if (claudeResult.status === 'rejected') {
    console.error('[analyzeIrisDual] Claude failed:', claudeResult.reason)
    const message = claudeResult.reason?.message ?? 'Claude analysis failed'
    // Tag non-retryable causes (400 invalid_request_error / 401 auth, e.g. insufficient
    // account credit) so it's obvious on sight in a failure_reason column that this needs
    // an account fix — this leg already fails fast with no retry either way.
    return {
      code: 'analysis_failed',
      message: isNonRetryableAIError(claudeResult.reason) ? `billing_or_auth_error: ${message}` : message,
    }
  }

  if (openaiResult.status === 'rejected') {
    console.warn('[analyzeIrisDual] GPT-4o failed, using Claude only:', openaiResult.reason)
    const parsed = parseReportResponse(claudeResult.value.text)
    if ('code' in parsed) return { code: 'analysis_failed', message: parsed.message }
    return parsed
  }

  console.log('[analyzeIrisDual] both complete, synthesising...')
  const synthesisStartedAt = Date.now()

  const langLabel = language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English'

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
   - A clinical claim — NOT a pure visual description ("the collarette is slightly irregular" = discard). A colour or scleral sign tied to a health meaning (e.g. brown over the liver area, or scleral yellowing → liver/gallbladder) IS a clinical finding — keep it.
3. Integrate extracted findings into the appropriate sections of Analysis A, phrased in your voice.
4. Where both analyses agree on a finding, state it with stronger confidence.
5. Where they contradict, keep Analysis A's position and note the discrepancy in one clause.
6. Every sentence in the final report must carry clinical value. Remove padding.
7. Output ONLY the final JSON. No preamble, no commentary, no markdown fences.

The reader is the practitioner and must NEVER see references to "Analysis A", "Analysis B", the model names, or any meta-commentary comparing the two source analyses. Never write phrases such as "Analysis B offered no contradiction". Produce one clean, integrated clinical report only.`

  let synthesisResponse: CompletionResponse
  try {
    synthesisResponse = await completeWithTruncationGuard(
      anthropic,
      {
        systemPrompt: `You are a senior clinical iridologist producing a definitive iris analysis report. Be direct. Every sentence must make a clinical claim.

LANGUAGE DIRECTIVE: You MUST write the ENTIRE response in ${langLabel}, including every JSON value, even if Analysis A or Analysis B below are written in a different language — translate and rewrite them into ${langLabel}. Do not use any other language under any circumstance. This is a hard requirement.`,
        userText: synthesisPrompt,
        images: [],
        maxTokens: 8192,
      },
      12288,
    )
  } catch (error) {
    console.warn('[analyzeIrisDual] synthesis truncated twice, falling back to Claude-only result:', error)
    const claudeParsed = parseReportResponse(claudeResult.value.text)
    if ('code' in claudeParsed) return { code: 'analysis_failed', message: claudeParsed.message }
    return claudeParsed
  }

  console.log(`[analyzeIrisDual] synthesis completed in ${Date.now() - synthesisStartedAt}ms (total: ${Date.now() - dualStartedAt}ms)`)

  const parsed = parseReportResponse(synthesisResponse.text)
  if ('code' in parsed) {
    console.warn('[analyzeIrisDual] synthesis parse failed, falling back to Claude-only result')
    const claudeParsed = parseReportResponse(claudeResult.value.text)
    if ('code' in claudeParsed) return { code: 'analysis_failed', message: claudeParsed.message }
    return claudeParsed
  }

  console.log('[analyzeIrisDual] synthesis complete ✓')
  return parsed
}
