import type { Provider } from './types'

// Network guard for `npm test`. Both SDKs (@anthropic-ai/sdk, openai) send every request
// through globalThis.fetch, read when the client is constructed, and src/test/setup.ts installs
// this guard before any test module loads. A request to a model API is answered by the active
// replay session (src/test/ai-replay/replay.ts) or refused. A refusal is also recorded as a
// violation that fails the test in afterEach, because production code catches and swallows
// some provider errors (the Jyotish enhancement returns the report unchanged on any error), so
// a rejected fetch alone could pass silently.
//
// State lives on globalThis so vi.resetModules() in a test cannot fork it.

export type AiRequestHandler = (provider: Provider, url: string, init: RequestInit | undefined) => Promise<Response>

interface GuardState {
  installed: boolean
  originalFetch: typeof fetch
  handler: AiRequestHandler | null
  violations: string[]
}

const KEY = Symbol.for('iridology.ai-replay.guard')

function state(): GuardState {
  const g = globalThis as unknown as Record<symbol, GuardState | undefined>
  if (!g[KEY]) {
    g[KEY] = { installed: false, originalFetch: globalThis.fetch, handler: null, violations: [] }
  }
  return g[KEY]!
}

const AI_HOST = /(^|\.)(anthropic\.com|openai\.com)$/i

/** Which provider a URL belongs to, by host or by API path (catches *_BASE_URL overrides). */
export function aiProviderForUrl(raw: string): Provider | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (/anthropic\.com$/i.test(url.hostname) || /\/v1\/messages(\/|$|\?)/.test(url.pathname)) return 'anthropic'
  if (/openai\.com$/i.test(url.hostname) || /\/chat\/completions$|\/v1\/responses$/.test(url.pathname)) return 'openai'
  if (AI_HOST.test(url.hostname)) return 'anthropic'
  return null
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export function recordAiViolation(message: string): void {
  state().violations.push(message)
}

/** Returns and clears the violations collected since the last call. */
export function takeAiGuardViolations(): string[] {
  const s = state()
  const out = s.violations
  s.violations = []
  return out
}

export function setAiRequestHandler(handler: AiRequestHandler | null): void {
  state().handler = handler
}

export function hasAiRequestHandler(): boolean {
  return state().handler !== null
}

export function installAiNetworkGuard(): void {
  const s = state()
  if (s.installed) return
  s.installed = true
  // A base URL override would point the SDKs somewhere the host check cannot see.
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.OPENAI_BASE_URL

  const original = s.originalFetch
  const guarded = async function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlOf(input)
    const provider = aiProviderForUrl(url)
    if (!provider) return original(input, init)
    const handler = state().handler
    if (!handler) {
      const message =
        `[ai-guard] BLOCKED a real ${provider} call to ${url} from npm test. Unit tests never reach a paid model API. ` +
        `Replay real recorded replies with startAiReplay() from src/test/ai-replay/replay.ts, or mock the provider. ` +
        `Real calls belong in \`npm run test:real-ai\` (opt-in, costs money).`
      recordAiViolation(message)
      throw new Error(message)
    }
    return handler(provider, url, init)
  } as typeof fetch
  globalThis.fetch = guarded
}
