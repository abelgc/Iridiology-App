import { describe, it, expect, vi, beforeEach } from 'vitest'

const streamMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return {
      messages: {
        stream: streamMock,
      },
    }
  }),
}))

import { AnthropicProvider } from '../anthropic-provider'

function mockResponse(overrides: Partial<{ text: string; stop_reason: string; usage: Record<string, number> }> = {}) {
  const {
    text = 'ok',
    stop_reason = 'end_turn',
    usage = { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, input_tokens: 100 },
  } = overrides

  return {
    content: [{ type: 'text', text }],
    stop_reason,
    usage,
  }
}

describe('AnthropicProvider', () => {
  beforeEach(() => {
    streamMock.mockReset()
    streamMock.mockReturnValue({
      finalMessage: () => Promise.resolve(mockResponse()),
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('sends the system prompt as a single cache_control-tagged block, not a plain string', async () => {
    const provider = new AnthropicProvider('test-key')
    await provider.complete({
      systemPrompt: 'You are a clinical iridologist. Full instructions...',
      userText: 'Analyze this iris.',
      images: [],
      maxTokens: 8192,
    })

    expect(streamMock).toHaveBeenCalledTimes(1)
    const callArgs = streamMock.mock.calls[0][0]

    expect(Array.isArray(callArgs.system)).toBe(true)
    expect(callArgs.system).toHaveLength(1)
    expect(callArgs.system[0]).toEqual({
      type: 'text',
      text: 'You are a clinical iridologist. Full instructions...',
      cache_control: { type: 'ephemeral' },
    })
  })

  it('still returns text and stopReason exactly as before', async () => {
    streamMock.mockReturnValue({
      finalMessage: () => Promise.resolve(mockResponse({ text: 'the report', stop_reason: 'max_tokens' })),
    })

    const provider = new AnthropicProvider('test-key')
    const result = await provider.complete({
      systemPrompt: 'instructions',
      userText: 'analyze',
      images: [],
      maxTokens: 100,
    })

    expect(result).toEqual({ text: 'the report', stopReason: 'max_tokens' })
  })

  it('logs cache usage from the response for observability', async () => {
    streamMock.mockReturnValue({
      finalMessage: () =>
        Promise.resolve(
          mockResponse({
            usage: { cache_creation_input_tokens: 5000, cache_read_input_tokens: 0, input_tokens: 5200 },
          }),
        ),
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const provider = new AnthropicProvider('test-key')
    await provider.complete({ systemPrompt: 'instructions', userText: 'analyze', images: [], maxTokens: 100 })

    expect(logSpy).toHaveBeenCalledWith(
      '[AnthropicProvider] cache usage',
      expect.objectContaining({
        cache_creation_input_tokens: 5000,
        cache_read_input_tokens: 0,
        input_tokens: 5200,
      }),
    )
  })
})
