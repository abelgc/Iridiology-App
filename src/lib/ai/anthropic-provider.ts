import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, CompletionRequest, CompletionResponse } from './types'

export class AnthropicProvider implements AIProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    // No SDK retries (each retry would re-run a 100s+ generation and blow the
    // function budget). Streaming below keeps long generations alive, so the
    // timeout only guards against a truly stalled connection.
    this.client = new Anthropic({ apiKey, timeout: 200000, maxRetries: 0 })
    this.model = model
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelToUse = request.modelId || this.model

    // Stream the response. A long report (large max_tokens over multiple images)
    // can take well over a non-streaming request timeout; streaming keeps the
    // connection active token-by-token so it is never cut off mid-generation.
    const stream = this.client.messages.stream({
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

    const response = await stream.finalMessage()

    const textBlock = response.content.find((c) => c.type === 'text')
    return {
      text: textBlock?.type === 'text' ? textBlock.text : '',
      stopReason: response.stop_reason ?? 'end_turn',
    }
  }
}
