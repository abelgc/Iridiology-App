import { anthropic } from './client'
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

INTERPRETACIÓN DEL PROFESIONAL (a revisar):
${request.practitionerInterpretation}

IMÁGENES:
Se adjuntan las imágenes del iris derecho e izquierdo del paciente.

Realiza una revisión técnica crítica de la interpretación del profesional. Valida lo que está bien fundamentado, cuestiona lo que podría ser incorrecto, y agrega hallazgos adicionales que no fueron mencionados. Mantén un tono de colega a colega. Genera tu respuesta en el formato JSON especificado con las tres subsecciones en cada sección (Validación, Cuestionamientos, Hallazgos adicionales).`
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
  try {
    const patientContext = await buildPatientContext(request.patientId)

    const userPrompt = buildReviewUserPrompt(
      request,
      patientContext.previousReportSummary,
      patientContext.practitionerCorrections,
    )

    // Call Claude API with vision
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: TECHNICAL_REVIEW_SYSTEM_PROMPT,
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
        max_tokens: 6144,
        system: TECHNICAL_REVIEW_SYSTEM_PROMPT,
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
          system: TECHNICAL_REVIEW_SYSTEM_PROMPT,
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
        return finalParseResult as ReportContent | ReviewError
      }

      return parseResult as ReportContent | ReviewError
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
        system: TECHNICAL_REVIEW_SYSTEM_PROMPT,
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

          const retryResponse = await anthropic.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 4096,
            system: TECHNICAL_REVIEW_SYSTEM_PROMPT,
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
