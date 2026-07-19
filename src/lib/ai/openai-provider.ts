import OpenAI from 'openai'
import type { AIProvider, CompletionRequest, CompletionResponse } from './types'

export class OpenAIProvider implements AIProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model = 'gpt-5.6-sol') {
    // No SDK retries (each retry would re-run a long generation and blow the
    // function budget). Streaming below keeps long generations alive, so the
    // timeout only guards against a truly stalled connection.
    this.client = new OpenAI({ apiKey, timeout: 200000, maxRetries: 0 })
    this.model = model
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const modelToUse = request.modelId || this.model

    // Stream the response so a long report is not cut off by a request timeout.
    const stream = await this.client.chat.completions.create({
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
      stream: true,
    })

    let text = ''
    let finishReason: string | null = null
    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      text += choice?.delta?.content ?? ''
      if (choice?.finish_reason) finishReason = choice.finish_reason
    }

    return {
      text,
      stopReason: finishReason === 'length' ? 'max_tokens' : 'end_turn',
    }
  }
}
