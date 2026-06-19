import { getAIProvider, getBothProviders } from '@/lib/ai/get-provider'
import { COMPARISON_ANALYSIS_SYSTEM_PROMPT } from './prompts'
import { buildPatientContext } from './context'
import { type ParseError } from './parse'
import { parseComparisonResponse } from './parse-comparison'
import { ComparisonReportContent } from '@/types/comparison-report'
import { ComparisonRequest } from '@/types/claude'
import { calculateAge } from '@/lib/utils'

export interface ComparisonError {
  code: 'analysis_failed' | 'response_too_long' | 'timeout'
  message: string
}

export const COMPARISON_SYNTHESIS_INSTRUCTIONS = `=== SYNTHESIS INSTRUCTIONS ===
1. You have two independent practitioner progress reviews of the same patient. Use Analysis A as the foundation.
2. From Analysis B, extract only findings about patterns absent from or stronger than in Analysis A. Discard descriptions without a directional change.
3. Merge into Analysis A's two-section structure, in your voice as an iridologist.
4. Each entry must follow this format: Pattern Name: [what changed and what it means — 1–2 sentences].
5. Remove anything that does not directly address improvement or persistent burden.
6. Output ONLY the final JSON with the 2 keys. No preamble, no commentary, no markdown fences.

MOBILIZATION: Increased peripheral expression or scleral activation without central densification = mobilization = comp_1_improvements.
IMAGE REFERENCE: Never write "images 1–2", "images 3–4", or refer to images by number. Use "previous session", "current session", "previous right eye", "previous left eye", "current right eye", "current left eye".
Never reference "Analysis A", "Analysis B", or the synthesis process. Produce one clean integrated progress review only.`

function buildComparisonUserPrompt(
  request: ComparisonRequest,
  previousReportSummary: string | null,
  practitionerCorrections: string | null,
): string {
  const age = request.patientData.date_of_birth
    ? calculateAge(new Date(request.patientData.date_of_birth))
    : 'Not specified'

  return `PATIENT DATA:
- Name: ${request.patientData.full_name}
- Age: ${age}
- Gender: ${request.patientData.gender || 'Not specified'}
- Clinical history: ${request.patientData.general_history || 'Not specified'}
- Current symptoms: ${request.patientData.symptoms || 'Not specified'}
- Practitioner clinical hypothesis (verify against iris findings independently — do not restate or echo these words in the report; confirm, contradict, or nuance through what you observe): ${request.patientData.practitioner_notes || 'None'}

PREVIOUS FINDINGS (if any):
${previousReportSummary || 'None'}

PRACTITIONER CORRECTIONS (if any):
${practitionerCorrections || 'None'}

PREVIOUS IMAGES (prior session):
- Previous right iris (attached)
- Previous left iris (attached)

CURRENT IMAGES (current session):
- Current right iris (attached)
- Current left iris (attached)

Compare the previous images with the current ones to detect changes, evolution, and phase transitions. Generate the complete clinical report in the specified JSON format, including detailed comparative analysis with directional change indicators (improvement / stagnation / deterioration) for each system.`
}

async function parseWithRetry(
  responseText: string,
  attempt: number = 1,
): Promise<ComparisonReportContent | ParseError | ComparisonError> {
  const result = parseComparisonResponse(responseText)

  if ('code' in result) {
    if (result.code === 'invalid_json' && attempt === 1) {
      return result
    }
    return {
      code: 'analysis_failed',
      message: `Failed to parse response after ${attempt} attempt(s): ${result.message}`,
    }
  }

  return result
}

export async function compareIris(request: ComparisonRequest): Promise<ComparisonReportContent | ComparisonError> {
  const images = [
    { data: request.previousRightIrisBase64, mediaType: 'image/jpeg' as const },
    { data: request.previousLeftIrisBase64, mediaType: 'image/jpeg' as const },
    { data: request.rightIrisBase64, mediaType: 'image/jpeg' as const },
    { data: request.leftIrisBase64, mediaType: 'image/jpeg' as const },
  ]

  try {
    const patientContext = await buildPatientContext(request.patientId)

    const userPrompt = buildComparisonUserPrompt(
      request,
      patientContext.previousReportSummary,
      patientContext.practitionerCorrections,
    )

    const both = await getBothProviders()

    // Single-provider path: active_provider is 'anthropic' or 'openai'.
    if (!both) {
      const provider = await getAIProvider()
      const response = await provider.complete({
        systemPrompt: COMPARISON_ANALYSIS_SYSTEM_PROMPT,
        userText: userPrompt,
        images,
        maxTokens: 8192,
      })

      if (response.stopReason === 'max_tokens') {
        return { code: 'response_too_long', message: 'Response truncated — report too long for token limit' }
      }

      const parseResult = await parseWithRetry(response.text)
      if ('code' in parseResult && parseResult.code === 'invalid_json') {
        const strongerPrompt = `${userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No additional text.`
        const retryResponse = await provider.complete({
          systemPrompt: COMPARISON_ANALYSIS_SYSTEM_PROMPT,
          userText: strongerPrompt,
          images,
          maxTokens: 8192,
        })
        const retryParseResult = await parseWithRetry(retryResponse.text, 2)
        return retryParseResult as ComparisonReportContent | ComparisonError
      }

      return parseResult as ComparisonReportContent | ComparisonError
    }

    // Dual-provider path: active_provider is 'both'. Run Claude + GPT in
    // parallel on the comparison, then synthesise into one definitive report —
    // same pattern as the standard dual analysis.
    const { anthropic, openai } = both

    const [claudeResult, openaiResult] = await Promise.allSettled([
      anthropic.complete({ systemPrompt: COMPARISON_ANALYSIS_SYSTEM_PROMPT, userText: userPrompt, images, maxTokens: 8192 }),
      openai.complete({ systemPrompt: COMPARISON_ANALYSIS_SYSTEM_PROMPT, userText: userPrompt, images, maxTokens: 8192 }),
    ])

    if (claudeResult.status === 'rejected') {
      return { code: 'analysis_failed', message: claudeResult.reason?.message ?? 'Claude comparison failed' }
    }

    if (openaiResult.status === 'rejected') {
      // GPT failed — fall back to the Claude-only comparison rather than error out.
      const parsed = parseComparisonResponse(claudeResult.value.text)
      if ('code' in parsed) return { code: 'analysis_failed', message: parsed.message }
      return parsed
    }

    const synthesisPrompt = `You performed two independent COMPARATIVE iris analyses of the same patient (previous session vs current session). Produce the definitive comparative clinical report.

=== ANALYSIS A (YOUR OWN — structural and stylistic foundation) ===
${claudeResult.value.text}

=== ANALYSIS B (GPT-4o — mine for bold clinical assertions only) ===
${openaiResult.value.text}

${COMPARISON_SYNTHESIS_INSTRUCTIONS}`

    const synthesisResponse = await anthropic.complete({
      systemPrompt: `You are a senior clinical iridologist producing a definitive comparative iris analysis report (previous vs current session). Be direct. Every sentence must make a clinical claim.`,
      userText: synthesisPrompt,
      images: [],
      maxTokens: 8192,
    })

    const parsed = parseComparisonResponse(synthesisResponse.text)
    if ('code' in parsed) {
      // Synthesis parse failed — fall back to the Claude-only comparison.
      const claudeParsed = parseComparisonResponse(claudeResult.value.text)
      if ('code' in claudeParsed) return { code: 'analysis_failed', message: claudeParsed.message }
      return claudeParsed
    }

    return parsed
  } catch (error) {
    return {
      code: 'analysis_failed',
      message: error instanceof Error ? error.message : 'Unknown error during comparison',
    }
  }
}
