import { anthropic } from './client'
import { STANDARD_ANALYSIS_SYSTEM_PROMPT } from './prompts'
import { buildPatientContext } from './context'
import { parseReportResponse, type ParseError } from './parse'
import { ReportContent } from '@/types/report'
import { AnalysisRequest } from '@/types/claude'
import { calculateAge } from '@/lib/utils'

export interface AnalysisError {
  code: 'analysis_failed' | 'response_too_long' | 'timeout'
  message: string
}

function buildUserPrompt(request: AnalysisRequest, previousReportSummary: string | null, practitionerCorrections: string | null): string {
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

IMAGES:
Right and left iris images of the patient are attached.

Analyse both irises and generate the complete clinical report in the specified JSON format. Maintain consistency with previous findings where applicable — if your assessment differs, explain the change.`
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

export async function analyzeIris(request: AnalysisRequest): Promise<ReportContent | AnalysisError> {
  try {
    const patientContext = await buildPatientContext(request.patientId)

    const userPrompt = buildUserPrompt(
      request,
      patientContext.previousReportSummary,
      patientContext.practitionerCorrections,
    )

    // Call Claude API with vision
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: STANDARD_ANALYSIS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: request.rightIrisBase64,
              },
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: request.leftIrisBase64,
              },
            },
          ],
        },
      ],
    })

    // Check for token limit
    if (response.stop_reason === 'max_tokens') {
      // Retry with 50% more tokens
      const retryResponse = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 6144, // 4096 * 1.5
        system: STANDARD_ANALYSIS_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt,
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: request.rightIrisBase64,
                },
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: request.leftIrisBase64,
                },
              },
            ],
          },
        ],
      })

      if (retryResponse.stop_reason === 'max_tokens') {
        return {
          code: 'response_too_long',
          message: 'Response still truncated after increasing token limit',
        }
      }

      const textContent = retryResponse.content.find((c) => c.type === 'text')
      if (!textContent || textContent.type !== 'text') {
        return {
          code: 'analysis_failed',
          message: 'No text content in API response',
        }
      }

      const parseResult = await parseWithRetry(textContent.text)
      if ('code' in parseResult && parseResult.code === 'invalid_json') {
        // Retry with stronger instruction
        const strongerPrompt = `${userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No additional text.`

        const finalResponse = await anthropic.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 6144,
          system: STANDARD_ANALYSIS_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: strongerPrompt,
                },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: request.rightIrisBase64,
                  },
                },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: request.leftIrisBase64,
                  },
                },
              ],
            },
          ],
        })

        const finalTextContent = finalResponse.content.find((c) => c.type === 'text')
        if (!finalTextContent || finalTextContent.type !== 'text') {
          return {
            code: 'analysis_failed',
            message: 'No text content in final API response',
          }
        }

        const finalParseResult = await parseWithRetry(finalTextContent.text, 2)
        return finalParseResult as ReportContent | AnalysisError
      }

      return parseResult as ReportContent | AnalysisError
    }

    const textContent = response.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return {
        code: 'analysis_failed',
        message: 'No text content in API response',
      }
    }

    const parseResult = await parseWithRetry(textContent.text)
    if ('code' in parseResult && parseResult.code === 'invalid_json') {
      // Retry with stronger instruction
      const strongerPrompt = `${userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No additional text.`

      const retryResponse = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: STANDARD_ANALYSIS_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: strongerPrompt,
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: request.rightIrisBase64,
                },
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: request.leftIrisBase64,
                },
              },
            ],
          },
        ],
      })

      const retryTextContent = retryResponse.content.find((c) => c.type === 'text')
      if (!retryTextContent || retryTextContent.type !== 'text') {
        return {
          code: 'analysis_failed',
          message: 'No text content in retry API response',
        }
      }

      const retryParseResult = await parseWithRetry(retryTextContent.text, 2)
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
          )

          const retryResponse = await anthropic.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 4096,
            system: STANDARD_ANALYSIS_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: userPrompt,
                  },
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/jpeg',
                      data: request.rightIrisBase64,
                    },
                  },
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/jpeg',
                      data: request.leftIrisBase64,
                    },
                  },
                ],
              },
            ],
          })

          const textContent = retryResponse.content.find((c) => c.type === 'text')
          if (!textContent || textContent.type !== 'text') {
            return {
              code: 'analysis_failed',
              message: 'No text content in retry API response',
            }
          }

          const parseResult = await parseWithRetry(textContent.text)
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
