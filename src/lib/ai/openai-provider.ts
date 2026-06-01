import OpenAI from 'openai'
import type { AIProvider, CompletionRequest, CompletionResponse } from './types'

export class OpenAIProvider implements AIProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model = 'gpt-4o') {
    this.client = new OpenAI({ apiKey, timeout: 100000, maxRetries: 1 })
    this.model = model
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelToUse = request.modelId || this.model
    const response = await this.client.chat.completions.create({
      model: modelToUse,
      max_completion_tokens: request.maxTokens,
      messages: [
        { role: 'system', content: request.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: request.userText },
            ...request.images.map((img) => ({
              type: 'image_url' as const,
              image_url: {
                url: `data:${img.mediaType};base64,${img.data}`,
              },
            })),
          ],
        },
      ],
    })

    const choice = response.choices[0]
    return {
      text: choice?.message?.content ?? '',
      stopReason: choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    }
  }
}
