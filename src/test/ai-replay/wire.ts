// HTTP responses in the exact wire format of the Anthropic Messages API and the OpenAI Chat
// Completions API, so the real SDKs parse them: JSON for a plain messages.create, server-sent
// events for messages.stream / chat.completions.create({ stream: true }), and the providers'
// error envelopes. The SDK then builds its own Message, stream snapshot or APIError from them.

export interface ServedMessage {
  text: string
  stopReason: 'end_turn' | 'max_tokens'
  inputTokens: number
  outputTokens: number
  model: string
}

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}_replay_${counter.toString().padStart(6, '0')}`
}

const CHUNK = 400

function chunks(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += CHUNK) out.push(text.slice(i, i + CHUNK))
  return out.length ? out : ['']
}

function sse(events: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'request-id': nextId('req') },
  })
}

function json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function anthropicMessage(m: ServedMessage, withContent: boolean) {
  return {
    id: nextId('msg'),
    type: 'message',
    role: 'assistant',
    model: m.model,
    content: withContent ? [{ type: 'text', text: m.text }] : [],
    stop_reason: withContent ? m.stopReason : null,
    stop_sequence: null,
    usage: {
      input_tokens: m.inputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: withContent ? m.outputTokens : 1,
    },
  }
}

export function anthropicJson(m: ServedMessage): Response {
  return json(200, anthropicMessage(m, true), { 'request-id': nextId('req') })
}

export function anthropicStream(m: ServedMessage): Response {
  const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
  const events = [
    event('message_start', { type: 'message_start', message: anthropicMessage(m, false) }),
    event('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ...chunks(m.text).map((text) =>
      event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }),
    ),
    event('content_block_stop', { type: 'content_block_stop', index: 0 }),
    event('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: m.stopReason, stop_sequence: null },
      usage: { output_tokens: m.outputTokens },
    }),
    event('message_stop', { type: 'message_stop' }),
  ]
  return sse(events)
}

export function openaiStream(m: ServedMessage, includeUsage: boolean): Response {
  const id = nextId('chatcmpl')
  const base = { id, object: 'chat.completion.chunk', created: 1759795200, model: m.model }
  const data = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`
  const events = [
    data({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] }),
    ...chunks(m.text).map((content) => data({ ...base, choices: [{ index: 0, delta: { content }, finish_reason: null }] })),
    data({ ...base, choices: [{ index: 0, delta: {}, finish_reason: m.stopReason === 'max_tokens' ? 'length' : 'stop' }] }),
  ]
  if (includeUsage) {
    events.push(
      data({
        ...base,
        choices: [],
        usage: { prompt_tokens: m.inputTokens, completion_tokens: m.outputTokens, total_tokens: m.inputTokens + m.outputTokens },
      }),
    )
  }
  events.push('data: [DONE]\n\n')
  return sse(events)
}

export function errorResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return json(status, body, { 'request-id': nextId('req'), ...headers })
}
