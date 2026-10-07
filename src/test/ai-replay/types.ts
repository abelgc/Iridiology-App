// Shared shapes for the AI record/replay layer. Kept free of `@/` imports so the importer
// script (scripts/ai-replay-import.ts, run by plain `node`) can load the same code.

export type Provider = 'anthropic' | 'openai'

export type Lang = 'es' | 'en' | 'de'

export const ROLES = [
  'claude-leg',
  'gpt-leg',
  'synthesis',
  'guard-fixation',
  'guard-history',
  'guard-zone-denial',
  'jyotish-chakra',
  'jyotish-blend',
  'planner',
  'writer-A',
  'writer-B',
  'writer-C',
] as const

export type Role = (typeof ROLES)[number]

/** One real model reply, full size, as the provider returned it. */
export interface Recording {
  format: 1
  role: Role
  lang: Lang
  provider: Provider
  model: string
  /** What the recorded request asked for. */
  request: { maxTokens: number; structuredOutput: boolean }
  response: {
    text: string
    /** Anthropic vocabulary: end_turn | max_tokens. OpenAI finish_reason 'stop'/'length' is mapped. */
    stopReason: 'end_turn' | 'max_tokens'
    usage: { inputTokens: number | null; outputTokens: number }
  }
  /** Wall time of the real call. Replayed only when a test asks for recorded latency. */
  ms: number
  source: { run: string; capturedAt: string; commit?: string; note?: string }
}

/** A provider answer that is not a model reply (a scripted step can also be a Recording). */
export type Reply =
  | { kind: 'http-error'; status: number; body: unknown; headers?: Record<string, string>; source: string }
  /** Never answers: only the SDK's own timeout (or the route's withTimeout) ends it. */
  | { kind: 'hang'; source: string }
