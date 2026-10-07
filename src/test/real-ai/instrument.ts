import { AsyncLocalStorage } from 'node:async_hooks'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// Records every real model call the pipeline makes: which call it was, the max_tokens it asked
// for, the tokens it actually produced, why it stopped, and how long it took. Responses are
// never altered. The only request change is `stream_options.include_usage` on OpenAI streams,
// without which a streamed completion reports no token usage at all.

export interface CallContext {
  lang: string
  tier: string
  stage: 'stage1' | 'stage2'
}

export interface RecordedCall {
  lang: string
  tier: string
  stage: string
  label: string
  provider: 'anthropic' | 'openai'
  model: string
  maxTokens: number
  inputTokens: number | null
  outputTokens: number | null
  stopReason: string | null
  ms: number
  text: string
  error: string | null
  schemaConstrained: boolean
}

export const OUTPUT_BUDGET_RATIO = 0.75

const context = new AsyncLocalStorage<CallContext>()
const calls: RecordedCall[] = []

export function runWithCallContext<T>(ctx: CallContext, fn: () => Promise<T>): Promise<T> {
  return context.run(ctx, fn)
}

export function recordedCalls(filter?: Partial<CallContext>): RecordedCall[] {
  return calls.filter(
    (c) =>
      (!filter?.lang || c.lang === filter.lang) &&
      (!filter?.tier || c.tier === filter.tier) &&
      (!filter?.stage || c.stage === filter.stage),
  )
}

function systemText(system: unknown): string {
  if (typeof system === 'string') return system
  if (Array.isArray(system)) {
    return system.map((b) => (b && typeof b === 'object' && 'text' in b ? String(b.text) : '')).join('\n')
  }
  return ''
}

function hasImage(content: unknown, imageType: string): boolean {
  return Array.isArray(content) && content.some((part) => part && typeof part === 'object' && part.type === imageType)
}

function labelFor(stage: string, provider: 'anthropic' | 'openai', system: string, withImages: boolean): string {
  if (system.startsWith('You are the Planner')) return 'planner'
  const writer = system.match(/^You are Writer ([ABC])/)
  if (writer) return `writer-${writer[1]}`
  if (system.includes('definitive iris analysis report')) return 'synthesis'
  if (system.includes('enhancing an emotional field section')) return 'jyotish-blend'
  if (/jyotish|vedic/i.test(system.slice(0, 400))) return 'jyotish-chakra'
  if (system.includes('contradicts a marking already written')) return 'guard-zone-denial'
  if (system.includes('named as the causal driver in too many sections')) return 'guard-fixation'
  if (system.includes("leans too often on the patient's own reported history")) return 'guard-history'
  if (withImages) return provider === 'anthropic' ? 'claude-leg' : 'gpt-leg'
  return `${stage}-other(${system.slice(0, 40).replace(/\s+/g, ' ')})`
}

function push(call: Omit<RecordedCall, 'lang' | 'tier' | 'stage' | 'schemaConstrained'>, ctx: CallContext | undefined, params: Record<string, unknown>) {
  const outputConfig = params.output_config as { format?: { type?: string } } | undefined
  const responseFormat = params.response_format as { type?: string } | undefined
  const schemaConstrained = outputConfig?.format?.type === 'json_schema' || responseFormat?.type === 'json_schema'
  calls.push({ lang: ctx?.lang ?? '?', tier: ctx?.tier ?? '?', stage: ctx?.stage ?? '?', ...call, schemaConstrained })
}

let installed = false

export function installModelCallRecorder(): void {
  if (installed) return
  installed = true

  const messages = Anthropic.Messages.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
  const originalCreate = messages.create
  const originalStream = messages.stream

  messages.create = function (this: unknown, ...args: unknown[]) {
    const params = args[0] as Record<string, unknown>
    const result = originalCreate.apply(this, args) as Promise<Anthropic.Message>
    // messages.stream() calls create({ stream: true }) internally; that path is recorded below.
    if (params?.stream) return result
    const ctx = context.getStore()
    const startedAt = Date.now()
    const system = systemText(params.system)
    const msgs = params.messages as Array<{ content: unknown }>
    const label = labelFor(ctx?.stage ?? '?', 'anthropic', system, hasImage(msgs?.[0]?.content, 'image'))
    result.then(
      (message) =>
        push(
          {
            label,
            provider: 'anthropic',
            model: String(params.model),
            maxTokens: Number(params.max_tokens),
            inputTokens: message.usage?.input_tokens ?? null,
            outputTokens: message.usage?.output_tokens ?? null,
            stopReason: message.stop_reason ?? null,
            ms: Date.now() - startedAt,
            text: message.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
            error: null,
          },
          ctx,
          params,
        ),
      (error: unknown) =>
        push(
          {
            label,
            provider: 'anthropic',
            model: String(params.model),
            maxTokens: Number(params.max_tokens),
            inputTokens: null,
            outputTokens: null,
            stopReason: null,
            ms: Date.now() - startedAt,
            text: '',
            error: error instanceof Error ? error.message : String(error),
          },
          ctx,
          params,
        ),
    )
    return result
  }

  messages.stream = function (this: unknown, ...args: unknown[]) {
    const params = args[0] as Record<string, unknown>
    const ctx = context.getStore()
    const startedAt = Date.now()
    const stream = originalStream.apply(this, args) as { finalMessage(): Promise<Anthropic.Message> }
    const system = systemText(params.system)
    const msgs = params.messages as Array<{ content: unknown }>
    const label = labelFor(ctx?.stage ?? '?', 'anthropic', system, hasImage(msgs?.[0]?.content, 'image'))
    stream.finalMessage().then(
      (message) =>
        push(
          {
            label,
            provider: 'anthropic',
            model: String(params.model),
            maxTokens: Number(params.max_tokens),
            inputTokens:
              (message.usage?.input_tokens ?? 0) +
              (message.usage?.cache_read_input_tokens ?? 0) +
              (message.usage?.cache_creation_input_tokens ?? 0),
            outputTokens: message.usage?.output_tokens ?? null,
            stopReason: message.stop_reason ?? null,
            ms: Date.now() - startedAt,
            text: message.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
            error: null,
          },
          ctx,
          params,
        ),
      (error: unknown) =>
        push(
          {
            label,
            provider: 'anthropic',
            model: String(params.model),
            maxTokens: Number(params.max_tokens),
            inputTokens: null,
            outputTokens: null,
            stopReason: null,
            ms: Date.now() - startedAt,
            text: '',
            error: error instanceof Error ? error.message : String(error),
          },
          ctx,
          params,
        ),
    )
    return stream
  }

  const completions = OpenAI.Chat.Completions.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
  const originalCompletionsCreate = completions.create

  completions.create = function (this: unknown, ...args: unknown[]) {
    const params = args[0] as Record<string, unknown>
    if (!params?.stream) return originalCompletionsCreate.apply(this, args)
    const ctx = context.getStore()
    const startedAt = Date.now()
    const msgs = params.messages as Array<{ role: string; content: unknown }>
    const system = systemText(msgs?.find((m) => m.role === 'system')?.content)
    const userContent = msgs?.find((m) => m.role === 'user')?.content
    const label = labelFor(ctx?.stage ?? '?', 'openai', system, hasImage(userContent, 'image_url'))
    const maxTokens = Number(params.max_completion_tokens ?? params.max_tokens)
    const withUsage = { ...params, stream_options: { include_usage: true } }
    const pending = originalCompletionsCreate.apply(this, [withUsage, ...args.slice(1)]) as Promise<
      AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
    >

    const fail = (error: unknown) =>
      push(
        {
          label,
          provider: 'openai',
          model: String(params.model),
          maxTokens,
          inputTokens: null,
          outputTokens: null,
          stopReason: null,
          ms: Date.now() - startedAt,
          text: '',
          error: error instanceof Error ? error.message : String(error),
        },
        ctx,
        params,
      )

    return pending.then(
      (stream) => ({
        async *[Symbol.asyncIterator]() {
          let text = ''
          let finishReason: string | null = null
          let usage: OpenAI.CompletionUsage | null = null
          try {
            for await (const chunk of stream) {
              text += chunk.choices[0]?.delta?.content ?? ''
              if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
              if (chunk.usage) usage = chunk.usage
              yield chunk
            }
          } catch (error) {
            fail(error)
            throw error
          }
          push(
            {
              label,
              provider: 'openai',
              model: String(params.model),
              maxTokens,
              inputTokens: usage?.prompt_tokens ?? null,
              outputTokens: usage?.completion_tokens ?? null,
              stopReason: finishReason,
              ms: Date.now() - startedAt,
              text,
              error: null,
            },
            ctx,
            params,
          )
        },
      }),
      (error: unknown) => {
        fail(error)
        throw error
      },
    )
  }
}

export function isTruncated(call: RecordedCall): boolean {
  return call.stopReason === 'max_tokens' || call.stopReason === 'length'
}

export function budgetViolations(list: RecordedCall[]): string[] {
  const out: string[] = []
  for (const c of list) {
    const where = `[${c.lang}/${c.tier}] ${c.stage}.${c.label} (${c.model})`
    if (c.error) {
      out.push(`${where}: call threw after ${(c.ms / 1000).toFixed(1)}s: ${c.error}`)
      continue
    }
    if (isTruncated(c)) {
      out.push(
        `${where}: TRUNCATED (stop_reason=${c.stopReason}) at ${c.outputTokens}/${c.maxTokens} output tokens after ${(c.ms / 1000).toFixed(1)}s`,
      )
      continue
    }
    if (c.outputTokens !== null && c.outputTokens > c.maxTokens * OUTPUT_BUDGET_RATIO) {
      out.push(
        `${where}: used ${c.outputTokens}/${c.maxTokens} output tokens (${Math.round((100 * c.outputTokens) / c.maxTokens)}%, limit ${OUTPUT_BUDGET_RATIO * 100}%) in ${(c.ms / 1000).toFixed(1)}s`,
      )
    }
    if (c.outputTokens === null) out.push(`${where}: provider reported no usage, cannot check the budget`)
  }
  return out
}

export function formatCallTable(list: RecordedCall[]): string {
  const header = 'lang  tier          stage   call              model                       out/max        %    stop        secs'
  const rows = list.map((c) => {
    const pct = c.outputTokens !== null ? `${Math.round((100 * c.outputTokens) / c.maxTokens)}%` : '?'
    return [
      c.lang.padEnd(5),
      c.tier.padEnd(13),
      c.stage.padEnd(7),
      c.label.slice(0, 17).padEnd(17),
      c.model.slice(0, 27).padEnd(27),
      `${c.outputTokens ?? '?'}/${c.maxTokens}`.padEnd(14),
      pct.padEnd(4),
      (c.error ? 'THREW' : (c.stopReason ?? '?')).padEnd(11),
      (c.ms / 1000).toFixed(1),
    ].join(' ')
  })
  return [header, ...rows].join('\n')
}
