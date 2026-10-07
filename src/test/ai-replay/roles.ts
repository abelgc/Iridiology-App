import type { Lang, Provider, Role } from './types'

// Which production call a request is, read off the request the real code built. Same rules as
// labelFor() in src/test/real-ai/instrument.ts, so a recording made by the real-AI suite and
// a request seen by the replay land on the same role name.

export interface ClassifiedRequest {
  provider: Provider
  role: Role | null
  /** The output language the prompt asks for, or null when the prompt does not say. */
  lang: Lang | null
  model: string
  maxTokens: number
  structuredOutput: boolean
  stream: boolean
  /** Only for Anthropic: the `thinking` mode sent, e.g. 'disabled' / 'enabled', or null when omitted. */
  thinking: string | null
  /** OpenAI streams report usage only when the request opts in. */
  includeUsage: boolean
  systemPreview: string
}

type Json = Record<string, unknown>

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => (part && typeof part === 'object' && 'text' in part ? String((part as Json).text) : ''))
      .join('\n')
  }
  return ''
}

function hasPart(content: unknown, type: string): boolean {
  return Array.isArray(content) && content.some((p) => p && typeof p === 'object' && (p as Json).type === type)
}

export function roleFor(provider: Provider, system: string, withImages: boolean): Role | null {
  if (system.startsWith('You are the Planner')) return 'planner'
  const writer = system.match(/^You are Writer ([ABC])/)
  if (writer) return `writer-${writer[1]}` as Role
  if (system.includes('definitive iris analysis report')) return 'synthesis'
  if (system.includes('enhancing an emotional field section')) return 'jyotish-blend'
  if (/jyotish|vedic/i.test(system.slice(0, 400))) return 'jyotish-chakra'
  if (system.includes('contradicts a marking already written')) return 'guard-zone-denial'
  if (system.includes('named as the causal driver in too many sections')) return 'guard-fixation'
  if (system.includes("leans too often on the patient's own reported history")) return 'guard-history'
  if (withImages) return provider === 'anthropic' ? 'claude-leg' : 'gpt-leg'
  return null
}

const LANGUAGE_NAMES: Record<string, Lang> = { English: 'en', Spanish: 'es', German: 'de' }

// Ordered: the first pattern that matches the system prompt, then the user text, wins.
const LANGUAGE_PATTERNS: RegExp[] = [
  /LANGUAGE DIRECTIVE: You MUST write the ENTIRE (?:report|response) in (English|Spanish|German)/,
  /Write ALL report content exclusively in (English)\b/,
  /Write every string value[\s\S]*?\bin (English|Spanish|German)\./,
  /^You are Writer [ABC]\. Write in (English|Spanish|German)\./,
  /Always respond in (English|Spanish|German)\./,
  /Respond in (English|Spanish|German)\./,
  /Write in (English|Spanish|German)\./,
]

export function languageFor(system: string, user: string): Lang | null {
  for (const pattern of LANGUAGE_PATTERNS) {
    for (const text of [system, user]) {
      const match = text.match(pattern)
      if (match) return LANGUAGE_NAMES[match[1]]
    }
  }
  return null
}

export function classifyRequest(provider: Provider, body: Json): ClassifiedRequest {
  const messages = (body.messages as Array<{ role?: string; content?: unknown }>) ?? []
  let system: string
  let userContent: unknown
  if (provider === 'anthropic') {
    system = textOf(body.system)
    userContent = messages[0]?.content
  } else {
    system = textOf(messages.find((m) => m.role === 'system')?.content)
    userContent = messages.find((m) => m.role === 'user')?.content
  }
  const user = textOf(userContent)
  const withImages = provider === 'anthropic' ? hasPart(userContent, 'image') : hasPart(userContent, 'image_url')
  const outputConfig = body.output_config as { format?: { type?: string } } | undefined
  const responseFormat = body.response_format as { type?: string } | undefined
  const thinking = body.thinking as { type?: string } | undefined
  const streamOptions = body.stream_options as { include_usage?: boolean } | undefined
  return {
    provider,
    role: roleFor(provider, system, withImages),
    lang: languageFor(system, user),
    model: String(body.model ?? ''),
    maxTokens: Number(provider === 'anthropic' ? body.max_tokens : (body.max_completion_tokens ?? body.max_tokens)),
    structuredOutput: outputConfig?.format?.type === 'json_schema' || responseFormat?.type === 'json_schema',
    stream: body.stream === true,
    thinking: thinking?.type ?? null,
    includeUsage: streamOptions?.include_usage === true,
    systemPreview: system.slice(0, 80).replace(/\s+/g, ' '),
  }
}
