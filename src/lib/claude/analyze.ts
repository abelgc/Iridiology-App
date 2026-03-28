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
    : 'No especificada'

  return `DATOS DEL PACIENTE:
- Nombre: ${request.patientData.full_name}
- Edad: ${age}
- Género: ${request.patientData.gender || 'No especificado'}
- Historia clínica: ${request.patientData.general_history || 'No especificada'}
- Síntomas actuales: ${request.patientData.symptoms || 'No especificados'}
- Notas del profesional: ${request.patientData.practitioner_notes || 'Ninguna'}

HALLAZGOS PREVIOS (si existen):
${previousReportSummary || 'Ninguno'}

CORRECCIONES DEL PROFESIONAL (si existen):
${practitionerCorrections || 'Ninguna'}

IMÁGENES:
Se adjuntan las imágenes del iris derecho e izquierdo del paciente.

Analiza ambos iris y genera el informe clínico completo en el formato JSON especificado. Mantén consistencia con los hallazgos previos cuando aplique — si difiere tu evaluación, explica el cambio.`
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
        const strongerPrompt = `${userPrompt}\n\nIMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin texto adicional.`

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
      const strongerPrompt = `${userPrompt}\n\nIMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin texto adicional.`

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
