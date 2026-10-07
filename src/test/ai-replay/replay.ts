import { classifyRequest, type ClassifiedRequest } from './roles'
import { DEFAULT_SET, findRecording } from './recordings'
import { recordAiViolation, setAiRequestHandler } from './guard'
import { anthropicJson, anthropicStream, errorResponse, openaiStream, type ServedMessage } from './wire'
import type { Lang, Provider, Recording, Reply, Role } from './types'

// Replay of REAL recorded model replies at the HTTP layer. Everything above fetch is production
// code: AnthropicProvider / OpenAIProvider / writing-pipeline's own Anthropic client, the SDKs'
// request building, streaming, retries and error classes, then prompt construction, parsing,
// retries and the routes. Only the provider's answer is canned.
//
// Budget-faithful: a recording knows how many output tokens the real model needed. A request
// whose max_tokens is lower gets the reply cut at max_tokens with stop_reason "max_tokens",
// exactly what the API does. So a budget regression (the 2026-10-07 Planner at 1200 against a
// real 4072) fails offline, through the real truncation-retry code, with the real error.
//
// Contract checks: the request must use the model, structured-output mode and thinking mode
// the recording was made with. Drift is a violation that fails the test (see guard.ts).

/** A scripted answer: a Reply, or a Recording served through the budget-faithful path. */
export type Step = Reply | Recording

export interface ReplayOptions {
  /** The run's language, used for calls whose prompt does not name one (the stage-1 guards). */
  lang?: Lang
  /** Recording set (src/test/ai-replay/recordings/<set>). Defaults to DEFAULT_SET. */
  set?: string
  /**
   * Per-role overrides. An array is consumed one entry per call of that role; the last entry
   * repeats. Roles not listed are served from the set.
   */
  script?: Partial<Record<Role, Step | Step[]>>
  /** 'none' (default): answer at once. 'recorded': take as long as the real call did. A number scales that. */
  latency?: 'none' | 'recorded' | number
}

export interface ServedCall {
  n: number
  role: Role | null
  lang: Lang | null
  provider: Provider
  model: string
  maxTokens: number
  structuredOutput: boolean
  outcome: 'reply' | 'truncated' | 'http-error' | 'hang' | 'refused'
  stopReason?: 'end_turn' | 'max_tokens'
  outputTokens?: number
  /** Output tokens the real model needed for this reply (the recording's usage). */
  neededTokens?: number
  status?: number
  source: string
}

/** One line per call: what was asked, what the API answered. For assertion messages. */
export function describeCalls(calls: ServedCall[]): string {
  return calls
    .map((c) => {
      const head = `#${c.n} ${String(c.role).padEnd(17)} ${c.lang ?? '??'} max_tokens ${String(c.maxTokens).padStart(5)}`
      if (c.outcome === 'truncated') return `${head} -> CUT OFF at ${c.outputTokens} (the real reply needs ${c.neededTokens})`
      if (c.outcome === 'reply') return `${head} -> ${c.outputTokens} tokens, end_turn`
      if (c.outcome === 'http-error') return `${head} -> HTTP ${c.status}`
      return `${head} -> ${c.outcome}: ${c.source}`
    })
    .join('\n')
}

export interface ReplaySession {
  readonly calls: ServedCall[]
  callsFor(role: Role): ServedCall[]
  stop(): void
}

function isRecording(step: Step): step is Recording {
  return (step as Recording).format === 1
}

function abortError(): Error {
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  return error
}

function sleep(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = ms > 0 ? setTimeout(done, ms) : null
    if (!timer) queueMicrotask(done)
    function done() {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      if (timer) clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function waitForAbort(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) return
    if (signal.aborted) return reject(abortError())
    signal.addEventListener('abort', () => reject(abortError()), { once: true })
  })
}

/** The reply the API would give for this recording at this max_tokens. */
export function budgetFaithful(recording: Recording, maxTokens: number): ServedMessage & { truncated: boolean } | { error: string } {
  const { text, stopReason, usage } = recording.response
  const recorded = usage.outputTokens
  const base = { inputTokens: usage.inputTokens ?? 0, model: recording.model }
  if (stopReason === 'max_tokens' && maxTokens > recorded) {
    return {
      error:
        `recording ${recording.role}/${recording.lang} (${recording.source.run}) was itself cut off at ${recorded} tokens; ` +
        `the full reply to a ${maxTokens}-token request is unknown. Re-record with a larger max_tokens.`,
    }
  }
  if (maxTokens >= recorded) return { ...base, text, stopReason, outputTokens: recorded, truncated: stopReason === 'max_tokens' }
  const cut = Math.floor((text.length * maxTokens) / recorded)
  return { ...base, text: text.slice(0, cut), stopReason: 'max_tokens', outputTokens: maxTokens, truncated: true }
}

function contractViolations(req: ClassifiedRequest, recording: Recording): string[] {
  const where = `${req.role}/${req.lang ?? recording.lang}`
  const out: string[] = []
  if (req.provider !== recording.provider) {
    out.push(`${where}: sent to ${req.provider}, recording is from ${recording.provider}`)
  }
  if (req.model !== recording.model) {
    out.push(`MODEL DRIFT ${where}: request uses model "${req.model}", recording was made with "${recording.model}". Re-record before trusting this test.`)
  }
  if (req.structuredOutput !== recording.request.structuredOutput) {
    out.push(
      `STRUCTURED OUTPUT DRIFT ${where}: request ${req.structuredOutput ? 'sends' : 'does not send'} a json_schema output format, ` +
        `the recording was made ${recording.request.structuredOutput ? 'with' : 'without'} one (${recording.source.run}). ` +
        `Use a recording set made with the same request shape (DEFAULT_SET in src/test/ai-replay/recordings.ts).`,
    )
  }
  if (req.provider === 'anthropic' && /sonnet/.test(req.model) && req.thinking !== 'disabled') {
    out.push(
      `THINKING DRIFT ${where}: ${req.model} request sends thinking=${req.thinking ?? 'omitted'}. Sonnet 5 thinks by default and ` +
        `spends the output budget on it; every recording was made with thinking disabled.`,
    )
  }
  return out
}

let active: { options: ReplayOptions; calls: ServedCall[]; perRole: Map<Role, number>; requests: number } | null = null

function resolveStep(role: Role, lang: Lang, set: string): { step: Step; source: string } | { error: string } {
  const scripted = active!.options.script?.[role]
  const index = active!.perRole.get(role) ?? 0
  active!.perRole.set(role, index + 1)
  if (scripted !== undefined) {
    const list = Array.isArray(scripted) ? scripted : [scripted]
    const step = list[Math.min(index, list.length - 1)]
    const source = isRecording(step) ? step.source.run : step.source
    return { step, source: `script[${role}][${Math.min(index, list.length - 1)}] ${source}` }
  }
  const found = findRecording(set, lang, role)
  if (!found && role.startsWith('guard-')) {
    // These guards only fire when a report trips their detector. Some languages never did, so
    // there is no recording; an empty object makes the guard fall back to the untouched report.
    return {
      step: {
        format: 1,
        role,
        lang,
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        request: { maxTokens: 4096, structuredOutput: false },
        response: { text: '{}', stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 1 } },
        ms: 1,
        source: { run: 'synthetic-empty-guard', capturedAt: '', note: `no ${role}/${lang} recording; guard keeps the report` },
      },
      source: `synthetic empty ${role}/${lang}`,
    }
  }
  if (!found) {
    return {
      error:
        `no recording for ${role}/${lang} in set "${set}". Record one: REAL_AI_LANGS=${lang} AI_REPLAY_RECORD=<set> npm run test:real-ai ` +
        `(see README "Testing AI without spending"), or script this role in the test.`,
    }
  }
  return { step: found.recording, source: found.file }
}

async function handle(provider: Provider, url: string, init: RequestInit | undefined): Promise<Response> {
  const session = active!
  const n = ++session.requests
  let body: Record<string, unknown>
  try {
    body = JSON.parse(String(init?.body ?? ''))
  } catch {
    const message = `[ai-replay] call #${n} to ${url} has no JSON body`
    recordAiViolation(message)
    throw new Error(message)
  }
  const req = classifyRequest(provider, body)
  const base = { n, role: req.role, lang: req.lang, provider, model: req.model, maxTokens: req.maxTokens, structuredOutput: req.structuredOutput }
  const refuse = (reason: string): never => {
    session.calls.push({ ...base, outcome: 'refused', source: reason })
    const message = `[ai-replay] refused call #${n} (${req.role ?? 'unknown role'}, ${provider}): ${reason}`
    recordAiViolation(message)
    throw new Error(message)
  }

  if (!req.role) refuse(`cannot tell which production call this is (system prompt starts "${req.systemPreview}"). Add it to roleFor() in roles.ts.`)
  const role = req.role!
  const lang = req.lang ?? session.options.lang
  if (!lang) refuse(`the prompt names no language and the replay session has no \`lang\``)
  const set = session.options.set ?? DEFAULT_SET
  const resolved = resolveStep(role, lang!, set)
  if ('error' in resolved) return refuse(resolved.error)
  const { step, source } = resolved
  const signal = init?.signal
  const latency = session.options.latency ?? 'none'
  const factor = latency === 'none' ? 0 : latency === 'recorded' ? 1 : latency

  if (isRecording(step)) {
    // Scripted failure shapes are historical (a restart reply, a cut-off, invalid JSON). They
    // must still play against today's request, which may send a json_schema the original call
    // did not. Contract checks apply to the DEFAULT_SET path, where a prompt change is a miss.
    const scripted = source.startsWith('script[')
    const violations = scripted ? [] : contractViolations(req, step)
    if (violations.length) refuse(violations.join('; '))
    const served = budgetFaithful(step, req.maxTokens)
    if ('error' in served) return refuse(served.error)
    // Partial output takes proportionally less time.
    await sleep(Math.round(step.ms * factor * (served.outputTokens / step.response.usage.outputTokens)), signal)
    session.calls.push({
      ...base,
      lang: lang!,
      outcome: served.truncated ? 'truncated' : 'reply',
      stopReason: served.stopReason,
      outputTokens: served.outputTokens,
      neededTokens: step.response.usage.outputTokens,
      source,
    })
    if (provider === 'openai') return openaiStream(served, req.includeUsage)
    return req.stream ? anthropicStream(served) : anthropicJson(served)
  }

  if (step.kind === 'hang') {
    session.calls.push({ ...base, lang: lang!, outcome: 'hang', source })
    return waitForAbort(signal)
  }

  session.calls.push({ ...base, lang: lang!, outcome: 'http-error', status: step.status, source })
  return errorResponse(step.status, step.body, step.headers)
}

/**
 * Starts answering model API calls from recordings. One session at a time; src/test/setup.ts
 * stops it after every test.
 */
export function startAiReplay(options: ReplayOptions = {}): ReplaySession {
  const session = { options, calls: [] as ServedCall[], perRole: new Map<Role, number>(), requests: 0 }
  active = session
  setAiRequestHandler((provider, url, init) => {
    if (active !== session) throw new Error('[ai-replay] a stopped replay session received a call')
    return handle(provider, url, init)
  })
  return {
    calls: session.calls,
    callsFor: (role) => session.calls.filter((c) => c.role === role),
    stop() {
      if (active === session) {
        active = null
        setAiRequestHandler(null)
      }
    },
  }
}

export function stopAiReplay(): void {
  active = null
  setAiRequestHandler(null)
}
