import { getAIProvider } from '@/lib/ai/get-provider'
import { TECHNICAL_REVIEW_SYSTEM_PROMPT } from './prompts'
import { buildPatientContext } from './context'
import { parseReportResponse, type ParseError } from './parse'
import { ReportContent } from '@/types/report'
import { TechnicalReviewRequest } from '@/types/claude'
import { calculateAge } from '@/lib/utils'

export interface ReviewError {
  code: 'analysis_failed' | 'response_too_long' | 'timeout'
  message: string
}

function buildReviewUserPrompt(
  request: TechnicalReviewRequest,
  previousReportSummary: string | null,
  practitionerCorrections: string | null,
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
- Practitioner notes: ${request.patientData.practitioner_notes || 'None'}

PREVIOUS FINDINGS (if any):
${previousReportSummary || 'None'}

PRACTITIONER CORRECTIONS (if any):
${practitionerCorrections || 'None'}

PRACTITIONER INTERPRETATION (to be reviewed):
${request.practitionerInterpretation}

IMAGES:
Right and left iris images of the patient are attached.

Perform a critical technical review of the practitioner's interpretation. Validate what is well-founded, question what may be incorrect, and add findings that were not mentioned. Maintain a colleague-to-colleague tone. Generate your response in the specified JSON format with the three sub-sections in each section (Validation, Questions, Additional findings).`
}

async function parseWithRetry(
  responseText: string,
  attempt: number = 1,
): Promise<ReportContent | ParseError | ReviewError> {
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

export async function reviewIris(request: TechnicalReviewRequest): Promise<ReportContent | ReviewError> {
  const provider = await getAIProvider()

  const images = [
    { data: request.rightIrisBase64, mediaType: 'image/jpeg' as const },
    { data: request.leftIrisBase64, mediaType: 'image/jpeg' as const },
  ]

  try {
    const patientContext = await buildPatientContext(request.patientId)

    const userPrompt = buildReviewUserPrompt(
      request,
      patientContext.previousReportSummary,
      patientContext.practitionerCorrections,
    )

    // Call AI provider with vision
    const response = await provider.complete({
      systemPrompt: TECHNICAL_REVIEW_SYSTEM_PROMPT,
      userText: userPrompt,
      images,
      maxTokens: 4096,
    })

    // Check for token limit
    if (response.stopReason === 'max_tokens') {
      // Retry with 50% more tokens
      const retryResponse = await provider.complete({
        systemPrompt: TECHNICAL_REVIEW_SYSTEM_PROMPT,
        userText: userPrompt,
        images,
        maxTokens: 6144,
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
          systemPrompt: TECHNICAL_REVIEW_SYSTEM_PROMPT,
          userText: strongerPrompt,
          images,
          maxTokens: 6144,
        })

        const finalParseResult = await parseWithRetry(finalResponse.text, 2)
        return finalParseResult as ReportContent | ReviewError
      }

      return parseResult as ReportContent | ReviewError
    }

    const parseResult = await parseWithRetry(response.text)
    if ('code' in parseResult && parseResult.code === 'invalid_json') {
      // Retry with stronger instruction
      const strongerPrompt = `${userPrompt}\n\nIMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin texto adicional.`

      const retryResponse = await provider.complete({
        systemPrompt: TECHNICAL_REVIEW_SYSTEM_PROMPT,
        userText: strongerPrompt,
        images,
        maxTokens: 4096,
      })

      const retryParseResult = await parseWithRetry(retryResponse.text, 2)
      return retryParseResult as ReportContent | ReviewError
    }

    return parseResult as ReportContent | ReviewError
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        // Retry once after 5 seconds
        await new Promise((resolve) => setTimeout(resolve, 5000))

        try {
          const patientContext = await buildPatientContext(request.patientId)
          const userPrompt = buildReviewUserPrompt(
            request,
            patientContext.previousReportSummary,
            patientContext.practitionerCorrections,
          )

          const retryResponse = await provider.complete({
            systemPrompt: TECHNICAL_REVIEW_SYSTEM_PROMPT,
            userText: userPrompt,
            images,
            maxTokens: 4096,
          })

          const parseResult = await parseWithRetry(retryResponse.text)
          return parseResult as ReportContent | ReviewError
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
      message: error instanceof Error ? error.message : 'Unknown error during review',
    }
  }
}
