import type { Lang, Provider, Recording, Role } from './types.ts'

// Turns one call captured by the real-AI suite (src/test/real-ai/instrument.ts RecordedCall,
// also the shape of every test-results/real-ai/*.json artifact) into a replay Recording, with
// personal data scrubbed. Used by record mode (src/test/real-ai/setup.ts) and by
// scripts/ai-replay-import.ts. Type-only imports: plain `node` loads this file too.

export interface CapturedCall {
  lang: string
  label: string
  provider: Provider
  model: string
  maxTokens: number
  inputTokens: number | null
  outputTokens: number | null
  stopReason: string | null
  ms: number
  text: string
  error: string | null
  schemaConstrained?: boolean
}

export interface CaptureMeta {
  run: string
  capturedAt: string
  commit?: string
  note?: string
  /** Names to scrub besides the patterns below (e.g. the intake names of the run). */
  names?: string[]
}

/** The fictional intake names of src/lib/client/__real_ai__/client-pipeline.real-ai.test.ts. */
export const REAL_AI_SUITE_NAMES = ['Lucía Prueba', 'Laura Test', 'Lena Test']

const KNOWN_ROLES = new Set<string>([
  'claude-leg', 'gpt-leg', 'synthesis', 'guard-fixation', 'guard-history', 'guard-zone-denial',
  'jyotish-chakra', 'jyotish-blend', 'planner', 'writer-A', 'writer-B', 'writer-C',
])

const LANGS = new Set<string>(['es', 'en', 'de'])

const SCRUBBERS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'client@example.com'],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g, 'sk-REDACTED'],
  [/\breq_[A-Za-z0-9]{8,}/g, 'req_REDACTED'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '00000000-0000-4000-8000-000000000000'],
  [/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}\b/g, 'IBAN-REDACTED'],
]

// Nine or more digits in one run of digits/spaces/dots/dashes/brackets: a phone number. A date
// (1984-03-15) has eight and is left alone.
const PHONE_CANDIDATE = /(?<![\w-])\+?\d[\d ().-]{7,}\d(?![\w-])/g
function scrubPhones(text: string): string {
  return text.replace(PHONE_CANDIDATE, (m) => (m.replace(/\D/g, '').length >= 9 ? '+00 000 000 000' : m))
}

function wholeWord(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'gu')
}

/**
 * Scrubs emails, API keys, request ids, UUIDs (report tokens), phone and IBAN-like numbers,
 * and each given full name -> "Ana Example", then its first name -> "Ana" (case-sensitive, so
 * "prueba" in a Spanish sentence survives "Lucía Prueba"). The real-AI suite only ever sends
 * fictional intake rows; this is the second line of defence, not the first.
 */
export function anonymize(text: string, names: string[] = []): string {
  let out = scrubPhones(text)
  for (const [pattern, replacement] of SCRUBBERS) out = out.replace(pattern, replacement)
  for (const name of names) {
    const full = name.trim()
    if (!full) continue
    out = out.replace(wholeWord(full), 'Ana Example')
    const first = full.split(/\s+/)[0]
    if (first.length > 1) out = out.replace(wholeWord(first), 'Ana')
  }
  return out
}

export function isKnownRole(label: string): label is Role {
  return KNOWN_ROLES.has(label)
}

/** null when the call cannot be replayed (it threw, it has no usage, or its role is unknown). */
export function toRecording(call: CapturedCall, meta: CaptureMeta): Recording | null {
  if (call.error || call.outputTokens === null || !isKnownRole(call.label) || !LANGS.has(call.lang)) return null
  const truncated = call.stopReason === 'max_tokens' || call.stopReason === 'length'
  return {
    format: 1,
    role: call.label,
    lang: call.lang as Lang,
    provider: call.provider,
    model: call.model,
    request: { maxTokens: call.maxTokens, structuredOutput: call.schemaConstrained === true },
    response: {
      text: anonymize(call.text, meta.names),
      stopReason: truncated ? 'max_tokens' : 'end_turn',
      usage: { inputTokens: call.inputTokens, outputTokens: call.outputTokens },
    },
    ms: call.ms,
    source: {
      run: meta.run,
      capturedAt: meta.capturedAt,
      ...(meta.commit ? { commit: meta.commit } : {}),
      ...(meta.note ? { note: meta.note } : {}),
    },
  }
}
