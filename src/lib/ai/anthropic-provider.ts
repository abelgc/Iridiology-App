import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, CompletionRequest, CompletionResponse } from './types'

export class AnthropicProvider implements AIProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model = 'claude-sonnet-5') {
    // No SDK retries (each retry would re-run a 100s+ generation and blow the
    // function budget). Streaming below keeps long generations alive, so the
    // timeout only guards against a truly stalled connection.
    this.client = new Anthropic({ apiKey, timeout: 200000, maxRetries: 0 })
    this.model = model
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelToUse = request.modelId || this.model

    // Haiku ships thinking off by default and gains real benefit from turning it on
    // (the first "small" Claude model with genuine extended-thinking support) — enable
    // it with a modest budget so Essential-tier analysis reasons like GPT-5.6-luna does.
    // Sonnet 5+ runs thinking on by default instead, which risks truncating the app's
    // tightly-budgeted JSON calls elsewhere (Planner/Writers) — keep those disabled.
    const thinking = modelToUse.includes('haiku')
      ? ({ type: 'enabled', budget_tokens: 2048 } as const)
      : ({ type: 'disabled' } as const)

    // Stream the response. A long report (large max_tokens over multiple images)
    // can take well over a non-streaming request timeout; streaming keeps the
    // connection active token-by-token so it is never cut off mid-generation.
    const stream = this.client.messages.stream({
      model: modelToUse,
      max_tokens: request.maxTokens,
      thinking,
      // 5-minute ephemeral cache: the same static system prompt is re-sent on
      // every retry (max_tokens truncation, invalid-JSON, timeout-catch) and
      // on both legs of a dual-model analysis. Caching it means only the
      // first send within a 5-minute window pays full input price.
      system: [
        {
          type: 'text' as const,
          text: request.systemPrompt,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
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

    console.log('[AnthropicProvider] cache usage', {
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      input_tokens: response.usage.input_tokens,
    })

    const textBlock = response.content.find((c) => c.type === 'text')
    return {
      text: textBlock?.type === 'text' ? textBlock.text : '',
      stopReason: response.stop_reason ?? 'end_turn',
    }
  }
}
