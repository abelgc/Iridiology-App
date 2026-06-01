import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, CompletionRequest, CompletionResponse } from './types'

export class AnthropicProvider implements AIProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey, timeout: 100000, maxRetries: 1 })
    this.model = model
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelToUse = request.modelId || this.model
    const response = await this.client.messages.create({
      model: modelToUse,
      max_tokens: request.maxTokens,
      system: request.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: request.userText },
            ...request.images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.data,
              },
            })),
          ],
        },
      ],
    })

    const textBlock = response.content.find((c) => c.type === 'text')
    return {
      text: textBlock?.type === 'text' ? textBlock.text : '',
      stopReason: response.stop_reason ?? 'end_turn',
    }
  }
}
