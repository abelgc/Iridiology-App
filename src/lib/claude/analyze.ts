import { getAIProvider } from '@/lib/ai/get-provider'
import { getStandardAnalysisSystemPrompt } from './prompts'
import { buildPatientContext } from './context'
import { parseReportResponse, type ParseError } from './parse'
import { ReportContent } from '@/types/report'
import { AnalysisRequest } from '@/types/claude'
import { calculateAge } from '@/lib/utils'

export interface AnalysisError {
  code: 'analysis_failed' | 'response_too_long' | 'timeout'
  message: string
}

const SYSTEM_LABELS: Record<string, string> = {
  digestive: 'Digestive',
  cardiovascular: 'Cardiovascular',
  respiratory: 'Respiratory',
  nervous: 'Nervous',
  musculoskeletal: 'Musculoskeletal',
  endocrine: 'Endocrine',
  urinary: 'Urinary',
  reproductive: 'Reproductive',
  skin_lymphatic: 'Skin/Lymphatic',
  sensory: 'Sensory',
  mental_emotional: 'Mental/Emotional',
  immune: 'Immune',
}

export function formatQuestionnaire(q: Record<string, unknown> | null | undefined): string {
  if (!q) return 'None reported'

  const lines: string[] = []

  for (const [system, label] of Object.entries(SYSTEM_LABELS)) {
    const section = q[system]
    if (!section || typeof section !== 'object') continue
    const positives = Object.entries(section as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k.replace(/_/g, ' '))
    if (positives.length > 0) {
      lines.push(`${label}: ${positives.join(', ')}`)
    }
  }

  const freeTexts: Array<[string, string]> = [
    ['known_allergies', 'Known allergies'],
    ['past_surgeries', 'Past surgeries'],
    ['family_history', 'Family history'],
  ]
  for (const [key, label] of freeTexts) {
    const val = q[key]
    if (typeof val === 'string' && val.trim()) {
      lines.push(`${label}: ${val.trim()}`)
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'None reported'
}

export function buildUserPrompt(
  request: AnalysisRequest,
  previousReportSummary: string | null,
  practitionerCorrections: string | null,
  healthQuestionnaire?: Record<string, unknown> | null,
): string {
  const age = request.patientData.date_of_birth
    ? calculateAge(request.patientData.date_of_birth)
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

PATIENT CLINICAL HISTORY (self-reported symptoms by body system):
${formatQuestionnaire(healthQuestionnaire ?? null)}

IMAGES:
Right and left iris images of the patient are attached.

Analyse both irises and generate the complete clinical report in the specified JSON format. Apply the CLINICAL HISTORY INTEGRATION rules: confirm iris findings that match reported symptoms with explicit causal reasoning; flag unmatched iris findings as preclinical signs. Maintain consistency with previous findings where applicable — if your assessment differs, explain the change.`
}

async function parseWithRetry(
  responseText: string,
  attempt: number = 1,
): Promise<ReportContent | ParseError | AnalysisError> {
  const result = parseReportResponse(responseText)

  if ('code' in result) {
    if (result.code === 'invalid_json' && attempt === 1) {
      // Return error to caller for retry with stronger instruction
      return result
    }
    return {
      code: 'analysis_failed',
      message: `Failed to parse response after ${attempt} attempt(s): ${result.message}`,
    }
  }

  return result
}

export async function analyzeIris(
  request: AnalysisRequest,
  language: 'en' | 'es' | 'fr' = 'es',
  modelId?: string,
  forceLanguage?: boolean,
): Promise<ReportContent | AnalysisError> {
  const provider = await getAIProvider()

  const images = [
    { data: request.rightIrisBase64, mediaType: 'image/jpeg' as const },
    { data: request.leftIrisBase64, mediaType: 'image/jpeg' as const },
  ]

  try {
    const patientContext = await buildPatientContext(request.patientId)

    const userPrompt = buildUserPrompt(
      request,
      patientContext.previousReportSummary,
      patientContext.practitionerCorrections,
      request.health_questionnaire,
    )

    let systemPrompt = getStandardAnalysisSystemPrompt(language as 'en' | 'es' | 'fr')
    if (forceLanguage) {
      systemPrompt = systemPrompt + '\n\nCRITICAL OVERRIDE: The ENTIRE response, every JSON value, every word MUST be written in the language specified above. Do not write a single word in any other language. This is a hard requirement.'
    }

    // Call AI provider with vision
    const response = await provider.complete({
      systemPrompt,
      userText: userPrompt,
      images,
      maxTokens: 8192,
      modelId,
    })

    // Check for token limit
    if (response.stopReason === 'max_tokens') {
      const retryResponse = await provider.complete({
        systemPrompt,
        userText: userPrompt,
        images,
        maxTokens: 12288,
        modelId,
      })

      if (retryResponse.stopReason === 'max_tokens') {
        return {
          code: 'response_too_long',
          message: 'Response still truncated after increasing token limit',
        }
      }

      const parseResult = await parseWithRetry(retryResponse.text)
      if ('code' in parseResult && parseResult.code === 'invalid_json') {
        // Retry with stronger instruction
        const strongerPrompt = `${userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No additional text.`

        const finalResponse = await provider.complete({
          systemPrompt,
          userText: strongerPrompt,
          images,
          maxTokens: 12288,
          modelId,
        })

        const finalParseResult = await parseWithRetry(finalResponse.text, 2)
        return finalParseResult as ReportContent | AnalysisError
      }

      return parseResult as ReportContent | AnalysisError
    }

    const parseResult = await parseWithRetry(response.text)
    if ('code' in parseResult && parseResult.code === 'invalid_json') {
      // Retry with stronger instruction
      const strongerPrompt = `${userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No additional text.`

      const retryResponse = await provider.complete({
        systemPrompt,
        userText: strongerPrompt,
        images,
        maxTokens: 8192,
        modelId,
      })

      const retryParseResult = await parseWithRetry(retryResponse.text, 2)
      return retryParseResult as ReportContent | AnalysisError
    }

    return parseResult as ReportContent | AnalysisError
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        // Retry once after 5 seconds
        await new Promise((resolve) => setTimeout(resolve, 5000))

        try {
          const patientContext = await buildPatientContext(request.patientId)
          const userPrompt = buildUserPrompt(
            request,
            patientContext.previousReportSummary,
            patientContext.practitionerCorrections,
            request.health_questionnaire,
          )
          let systemPrompt = getStandardAnalysisSystemPrompt(language as 'en' | 'es' | 'fr')
          if (forceLanguage) {
            systemPrompt = systemPrompt + '\n\nCRITICAL OVERRIDE: The ENTIRE response, every JSON value, every word MUST be written in the language specified above. Do not write a single word in any other language. This is a hard requirement.'
          }

          const retryResponse = await provider.complete({
            systemPrompt,
            userText: userPrompt,
            images,
            maxTokens: 8192,
            modelId,
          })

          const parseResult = await parseWithRetry(retryResponse.text)
          return parseResult as ReportContent | AnalysisError
        } catch {
          return {
            code: 'timeout',
            message: 'Request timed out after retry',
          }
        }
      }
    }

    return {
      code: 'analysis_failed',
      message: error instanceof Error ? error.message : 'Unknown error during analysis',
    }
  }
}

/**
 * Client-facing analyze function that accepts base64 images and simple patient data.
 * Wraps analyzeIris with format conversion for the client upload flow.
 */
export async function analyze(options: {
  images: [string, string] // [right_eye_base64, left_eye_base64]
  patient: {
    full_name: string
    date_of_birth: string
    general_history: string
    symptoms: string
    practitioner_notes: string
  }
  health_questionnaire?: Record<string, unknown> | null
  language: 'en' | 'es' | 'fr'
  modelId?: string
  forceLanguage?: boolean
}): Promise<ReportContent | AnalysisError> {
  // Convert base64 data URLs to the format expected by analyzeIris
  // Strip the "data:image/...;base64," prefix
  const extractBase64 = (dataUrl: string): string => {
    const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
    return match ? match[1] : dataUrl
  }

  const request: AnalysisRequest = {
    sessionId: '', // Client analyses don't have a session ID
    patientId: '', // Client analyses don't have a patient ID, they're one-off
    patientData: {
      full_name: options.patient.full_name,
      date_of_birth: options.patient.date_of_birth,
      gender: null,
      general_history: options.patient.general_history,
      symptoms: options.patient.symptoms,
      practitioner_notes: options.patient.practitioner_notes,
    },
    health_questionnaire: options.health_questionnaire ?? null,
    rightIrisBase64: extractBase64(options.images[0]),
    leftIrisBase64: extractBase64(options.images[1]),
  }

  return analyzeIris(request, options.language, options.modelId, options.forceLanguage)
}
