import { getAIProvider, getBothProviders } from '@/lib/ai/get-provider'
import { COMPARISON_ANALYSIS_SYSTEM_PROMPT } from './prompts'
import { buildPatientContext } from './context'
import { parseReportResponse, type ParseError } from './parse'
import { ReportContent } from '@/types/report'
import { ComparisonRequest } from '@/types/claude'
import { calculateAge } from '@/lib/utils'

export interface ComparisonError {
  code: 'analysis_failed' | 'response_too_long' | 'timeout'
  message: string
}

export const COMPARISON_SYNTHESIS_INSTRUCTIONS = `=== SYNTHESIS INSTRUCTIONS ===
1. Start from Analysis A. Its JSON structure, writing style, and comparative format (the improvement / stagnation / deterioration indicators per system) are correct.
2. From Analysis B, extract ONLY specific, named clinical findings or directional changes that are absent or understated in Analysis A. Discard pure visual iris descriptions.
3. Integrate extracted findings into the appropriate sections of Analysis A, phrased in your voice, preserving the directional change indicator for each system.
4. Where both analyses agree on a change, state it with stronger confidence. Where they contradict, keep Analysis A's position and note the discrepancy in one clause.
5. Every sentence must carry clinical value. Remove padding.
6. Output ONLY the final JSON. No preamble, no commentary, no markdown fences.

The reader is the practitioner and must NEVER see references to "Analysis A", "Analysis B", the model names, or any meta-commentary comparing the two source analyses. Never write phrases such as "Analysis B offered no contradiction". Produce one clean, integrated clinical report only.

Prioritise meaningful change: lead with what changed, what worsened, what improved, what stabilized, and what became compensatory. Do not rewrite unchanged sections unnecessarily, and do NOT repeat "stable", "stagnant", or "no change" in every section — state the absence of meaningful change once, globally, in the conclusion.`

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
): Promise<ReportContent | ParseError | ComparisonError> {
  const result = parseReportResponse(responseText)

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

export async function compareIris(request: ComparisonRequest): Promise<ReportContent | ComparisonError> {
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
        return retryParseResult as ReportContent | ComparisonError
      }

      return parseResult as ReportContent | ComparisonError
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
      const parsed = parseReportResponse(claudeResult.value.text)
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

    const parsed = parseReportResponse(synthesisResponse.text)
    if ('code' in parsed) {
      // Synthesis parse failed — fall back to the Claude-only comparison.
      const claudeParsed = parseReportResponse(claudeResult.value.text)
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
