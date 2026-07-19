import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicApiKey } from '@/lib/ai/get-provider'
import { isNonRetryableAIError } from '@/lib/ai/errors'
import { sanitizeJsonControlCharacters } from '@/lib/claude/json-repair'
import type { ReportContent, ReportSectionKey } from '@/types/report'

const MODEL = 'claude-sonnet-5'

function languageName(lang: string): string {
  if (lang === 'de') return 'German'
  if (lang === 'es') return 'Spanish'
  return 'English'
}

function safetyLine(lang: string): string {
  if (lang === 'de') return 'Sprich mit deinem Arzt, bevor du fastest oder eine intensive Reinigung machst.'
  if (lang === 'es') return 'Consulta con tu médico antes de cualquier ayuno o limpieza intensiva.'
  return 'Check with your doctor before any fasting or intensive cleanse.'
}

// Derives a first name from a full name for Writer A's greeting. Exported so the caller
// (stage2/route.ts) can compute it from the client_analyses row before this pipeline ever
// runs — the pipeline itself only ever sees the already-derived first name, never the raw
// intake row.
export function firstNameFrom(fullName: string | null): string {
  const trimmed = fullName?.trim()
  return trimmed ? trimmed.split(/\s+/)[0] : ''
}

async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  if (response.stop_reason === 'max_tokens') {
    // The model hit its token cap mid-generation, leaving a truncated, unparseable JSON
    // fragment — confirmed in production ("Unterminated string in JSON"). Retry once with
    // double the budget instead of handing a cut-off string to JSON.parse, mirroring the
    // same max_tokens retry analyze.ts already does for Stage 1.
    const retryResponse = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens * 2,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })
    if (retryResponse.stop_reason === 'max_tokens') {
      throw new Error(`response_too_long: truncated even after doubling max_tokens to ${maxTokens * 2}`)
    }
    const retryBlock = retryResponse.content.find((b) => b.type === 'text')
    return retryBlock?.type === 'text' ? retryBlock.text.trim() : ''
  }

  const block = response.content.find((b) => b.type === 'text')
  return block?.type === 'text' ? block.text.trim() : ''
}

// Claude sometimes wraps JSON in a markdown fence despite instructions not to — strip it
// before parsing rather than failing the whole call over a formatting slip.
function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

type SystemVerdict = { verdict: 'needs-action' | 'fine'; clue: string }

const BRIEF_SYSTEM_KEYS = [
  'section_2_emotional_field',
  'section_3_cognitive_nervous',
  'section_4_immune_lymphatic',
  'section_5_endocrine_hormonal',
  'section_6_circulatory_cardiorespiratory',
  'section_7_hepatic',
  'section_8_digestive_intestinal',
  'section_9_renal_urinary',
  'section_10_structural_integumentary',
] as const

type BriefSystemKey = typeof BRIEF_SYSTEM_KEYS[number]

type ClientReportBrief = {
  clientFirstName: string
  dominantPattern: string
  mainDriver: string
  symptomFindingMap: string[]
  systemVerdicts: Record<BriefSystemKey, SystemVerdict>
  crossSystemLinks: string[]
  knownDiagnoses: string[]
  safety: { flags: string[]; constraint: string | null }
}

// clientFirstName is never asked of the model — the caller already knows it, so it's
// spliced into the parsed brief directly rather than trusting an LLM to echo PII correctly.
function parseBrief(raw: string, clientFirstName: string): ClientReportBrief {
  const parsed = JSON.parse(sanitizeJsonControlCharacters(stripJsonFence(raw)))
  if (
    typeof parsed.dominantPattern !== 'string' ||
    typeof parsed.mainDriver !== 'string' ||
    typeof parsed.systemVerdicts !== 'object' ||
    parsed.systemVerdicts === null
  ) {
    throw new Error('invalid_brief_shape')
  }
  return {
    clientFirstName,
    dominantPattern: parsed.dominantPattern,
    mainDriver: parsed.mainDriver,
    symptomFindingMap: Array.isArray(parsed.symptomFindingMap) ? parsed.symptomFindingMap : [],
    systemVerdicts: parsed.systemVerdicts,
    crossSystemLinks: Array.isArray(parsed.crossSystemLinks) ? parsed.crossSystemLinks : [],
    knownDiagnoses: Array.isArray(parsed.knownDiagnoses) ? parsed.knownDiagnoses : [],
    safety: {
      flags: Array.isArray(parsed.safety?.flags) ? parsed.safety.flags : [],
      constraint: typeof parsed.safety?.constraint === 'string' ? parsed.safety.constraint : null,
    },
  }
}

const PLANNER_SYSTEM_PROMPT = `You are the Planner for a client iridology report. You read the full hidden clinical report below — a JSON object, one field per section, written for a practitioner. It may contain iris, zone, fibre, and other clinical language. You never write client-facing prose yourself. You extract a compact BRIEF that three writers will use instead of the full report.

Return ONLY a JSON object, no commentary, no markdown fences, with exactly these keys:
{
  "dominantPattern": string — the single dominant pattern across the whole case,
  "mainDriver": string — the ONE main driver behind that pattern; if you find yourself naming two, keep narrowing until there is one,
  "symptomFindingMap": string[] — each reported symptom tied to the one finding that explains it, one short string per pair, e.g. "fatigue -> adrenal strain",
  "systemVerdicts": {
    "section_2_emotional_field": { "verdict": "needs-action" | "fine", "clue": string },
    "section_3_cognitive_nervous": { "verdict": "needs-action" | "fine", "clue": string },
    "section_4_immune_lymphatic": { "verdict": "needs-action" | "fine", "clue": string },
    "section_5_endocrine_hormonal": { "verdict": "needs-action" | "fine", "clue": string },
    "section_6_circulatory_cardiorespiratory": { "verdict": "needs-action" | "fine", "clue": string },
    "section_7_hepatic": { "verdict": "needs-action" | "fine", "clue": string },
    "section_8_digestive_intestinal": { "verdict": "needs-action" | "fine", "clue": string },
    "section_9_renal_urinary": { "verdict": "needs-action" | "fine", "clue": string },
    "section_10_structural_integumentary": { "verdict": "needs-action" | "fine", "clue": string }
  },
  "crossSystemLinks": string[] — each cross-system connection stated ONCE, in plain internal language, e.g. "liver strain is compounding the digestive load",
  "knownDiagnoses": string[] — conditions the report itself marks as the patient's own pre-existing or already-diagnosed history (for example "the patient reports a history of...", "previously diagnosed with...") — NEVER a condition the report presents as something this iris reading found or detected. Only include it if the report's own wording clearly frames it as prior patient history. Empty array if none, or if you are unsure.
  "safety": {
    "flags": string[] — any of these you find real evidence for in the report: low body weight, low BMI, elderly and low weight, pregnancy, eating-disorder history, diabetes, any serious diagnosed condition. Empty array if none,
    "constraint": string | null — "gentle support only, no fasting or aggressive protocols" if flags is non-empty, otherwise null
  }
}
Base every field only on what the report actually supports — never invent a finding, a symptom, a diagnosis, or a link that is not there. If you are unsure whether a safety flag or a diagnosis applies, leave it out.

For "section_2_emotional_field" specifically: if the source text names a specific chakra (e.g. "Root Chakra") and/or a specific emotion to work with, the clue MUST quote both names verbatim — never paraphrase, generalize, or drop them. This is a paid detail the client is specifically promised.`

async function runPlanner(
  client: Anthropic,
  report: ReportContent,
  clientFirstName: string
): Promise<ClientReportBrief> {
  const userContent = JSON.stringify(report)
  try {
    const raw = await callClaude(client, PLANNER_SYSTEM_PROMPT, userContent, 1200)
    return parseBrief(raw, clientFirstName)
  } catch (error) {
    if (isNonRetryableAIError(error)) {
      // A 400 invalid_request_error (e.g. insufficient account credit) or a 401 auth error
      // will fail identically on a second attempt — don't spend a second Planner call on it,
      // just propagate so the caller can fail fast.
      throw error
    }
    // One retry: the Planner is a single point of failure for the whole report — a transient
    // error here would otherwise dump all 14 sections to raw practitioner text on the first
    // hiccup. Retrying once is cheap relative to the old ~52-call pipeline (worst case: 5 calls
    // instead of 4, only when the first Planner attempt fails).
    const raw = await callClaude(client, PLANNER_SYSTEM_PROMPT, userContent, 1200)
    return parseBrief(raw, clientFirstName)
  }
}

type WriterGroup = {
  role: 'A' | 'B' | 'C'
  keys: ReportSectionKey[]
}

const WRITER_GROUPS: WriterGroup[] = [
  {
    role: 'A',
    keys: [
      'section_1_general_terrain',
      'section_2_emotional_field',
      'section_3_cognitive_nervous',
      'section_4_immune_lymphatic',
      'section_5_endocrine_hormonal',
    ],
  },
  {
    role: 'B',
    keys: [
      'section_6_circulatory_cardiorespiratory',
      'section_7_hepatic',
      'section_8_digestive_intestinal',
      'section_9_renal_urinary',
      'section_10_structural_integumentary',
    ],
  },
  {
    role: 'C',
    keys: [
      'section_11_detected_axes',
      'section_12_conclusion',
      'section_13_strengths_of_the_body',
    ],
  },
]

const SHARED_WRITER_RULES = `LAYER MODEL:
The brief you receive is hidden Layer 1 reasoning (zones, clock positions, fibre, pigment, constitution, axes) — it never appears in your output. You write Layer 2: the client report. State CONCLUSIONS as facts about the client's body. Never write "the iris", "the zone", "fibre", "8 o'clock", or any colour or shape of the eye. Say "your liver", "your colon", "your nervous system". Every sentence you write is the LAST link of a hidden chain, never the chain itself.

THE VALUE RULE:
Every sentence must do ONE of: (a) say what is happening in their body, (b) say what they feel because of it, or (c) say what to do. If a sentence does none of these, cut it. Delete on sight: any description of the eye (colour, shape, tone, structure); mechanism and physiology; generic health lessons not about this person; anything already said elsewhere. One idea per sentence, everyday words, about 15 to 20 words per sentence. A system that needs action gets 2 to 4 sentences; a system that is fine gets one honest line.
Worked example — delete: "Both irises present a biliary constitution — the base colour is a mixed yellow-green-brown tone across the full stroma." Keep instead: "Your body naturally leans toward a liver-and-lymph type, so those systems work hardest and respond best to support."

VOICE:
Direct, categorical, priority-first — confident about the PROBLEM, optimistic about RECOVERY. Talk TO the person ("your liver is running slow"), never about a chart ("the liver shows reduced efficiency"). Open every section with the main finding as a short confident verdict, then what it connects to, then why it matters or its priority. No alarm words, no capitals, no catastrophe.
Dial — land in the MIDDLE. Too soft: "Your kidneys and adrenals show room to improve filtration and hormone production, a balancing pattern that responds well to support." Too hard: "Your adrenals are weak and toxic — reduce all stress and take adaptogens." Target: "Your stress glands are worn down from running on high too long, and that's behind your fatigue and poor sleep — calm, steady support turns this around."

ASSERT VS REDIRECT:
Assert plainly, as fact, terrain iridology genuinely reads: colon congestion, liver sluggishness, lymphatic stasis, adrenal strain, nervous-system tension, digestive weakness, constitutional type, load, priority order. Never assert — only "worth checking with your doctor" — a disease name, organ damage, hormone/cholesterol/blood-sugar levels, parasites, "toxins" in an organ, toxic blood, blood-flow abnormality, or structural integrity; anything only a lab, blood test, or scan could confirm. Causation stays soft: "this fits with" / "can fit with" / "may be contributing to" — NEVER "proves / explains / confirms". The voice confidence above never overrides this line.
Forbidden → use instead: toxic / failing / damaged / blocked / severely affected / weak organ / dangerous → under strain / carrying extra load / sluggish / needs support / reduced resilience / a priority area.

KNOWN DIAGNOSES:
If brief.knownDiagnoses is non-empty and the section you are writing concerns one of those conditions, reference it only as history the client already knows about — e.g. "Because your [condition] is already diagnosed, keep it under your doctor's review; this works alongside that care." Never say the reading detected, confirmed, or found it.

SAFETY GATE:
If brief.safety.flags is non-empty, do not suggest fasting, aggressive cleanses, parasite protocols, or protein restriction in any section you write. Use gentle, moderate language for any lifestyle direction.

SELF-CHECK (run silently on your own output before returning):
1. Any sentence describing the eye (colour, shape, structure)? Delete the description, keep only the meaning.
2. Does every sentence pass the value rule (a/b/c)? Cut anything that does not.
3. Any disease, lab level, organ damage, or parasite asserted instead of redirected? Fix it.
4. Any "proves/explains/confirms" language? Change it to "fits with" / "may be contributing to".
5. If you wrote section_13_strengths_of_the_body, is it free of "healthy/fine/undamaged/disease-free"?
6. If you are Writer A: was the client's first name (if given) used exactly once, warmly, near the opening? If you are Writer B or C: you should not be introducing the client by name.
7. Is the voice at the target level — direct and categorical, not soft, not alarmist?

Return ONLY a JSON object, no commentary, no markdown fences. The object's keys must be exactly the section keys listed above, each holding the finished prose for that section.`

function sectionInstructions(key: ReportSectionKey, lang: string): string {
  switch (key) {
    case 'section_1_general_terrain':
      return 'section_1_general_terrain: open with the big picture — brief.dominantPattern, the ONE main driver (brief.mainDriver), and the overall message. This is where the through-line lives. If brief.clientFirstName is non-empty, address the client by that first name once, warmly, near the very start, before switching to "you" for the rest of the report; if it is empty, skip the greeting and use "you" from the first sentence.'
    case 'section_11_detected_axes':
      return "section_11_detected_axes (\"Detected Patterns\"): write one \"-\" bullet per entry in brief.crossSystemLinks, in plain words — aim for 5 to 8 when the case supports that many, but never pad beyond what brief.crossSystemLinks actually contains. Not a repeat of the other sections' titles or content. If brief.crossSystemLinks is empty, write one honest line saying no notable cross-system pattern stood out."
    case 'section_12_conclusion':
      return `section_12_conclusion: tell the recovery story and the order of priorities — the main priorities and a clear order of support — using brief.dominantPattern, brief.mainDriver, and brief.systemVerdicts. Introduce no new findings, do not repeat the other sections. If brief.safety.flags is non-empty, end this section with exactly this line, in ${languageName(lang)}: "${safetyLine(lang)}"`
    case 'section_13_strengths_of_the_body':
      return 'section_13_strengths_of_the_body: name what\'s holding up well, drawn from any brief.systemVerdicts entries marked "fine" — reserve, adaptability, capacity to respond. Never write "healthy", "fine", "undamaged", or "disease-free" — say what you\'d expect from a body with real reserve instead, e.g. "your lungs show few patterns and good reserve". Motivating and true.'
    case 'section_2_emotional_field':
      return 'section_2_emotional_field: use brief.systemVerdicts["section_2_emotional_field"] — a short plain verdict, then what it causes for the client, then the direction of the fix. Cover the system even when its verdict is "fine" (one honest line). If the clue names a specific chakra and/or emotion to work with, state both explicitly by name as a clear, personal recommendation — this is a paid detail the client is specifically promised, never fold it anonymously into generic language. If brief.knownDiagnoses includes a condition that belongs to this system, reference it only as history already under a doctor\'s care per the KNOWN DIAGNOSES rule below — never as something this reading found.'
    default:
      return `${key}: use brief.systemVerdicts["${key}"] — a short plain verdict, then what it causes for the client, then the direction of the fix. Cover the system even when its verdict is "fine" (one honest line). If brief.knownDiagnoses includes a condition that belongs to this system, reference it only as history already under a doctor's care per the KNOWN DIAGNOSES rule below — never as something this reading found.`
  }
}

function buildWriterPrompt(group: WriterGroup, lang: string): string {
  const roleLine = `You are Writer ${group.role}. Write in ${languageName(lang)}. You are writing part of a client-facing iridology report for someone with zero health knowledge — think of a gardener reading it once and acting on it. Never mention the iris, its colour, shape, or structure. You write exactly these sections, using the shared BRIEF you are given as your only source: ${group.keys.join(', ')}.`
  const perSection = group.keys.map((key) => sectionInstructions(key, lang)).join('\n')
  return `${roleLine}\n\n${perSection}\n\n${SHARED_WRITER_RULES}`
}

async function runWriter(
  client: Anthropic,
  brief: ClientReportBrief,
  group: WriterGroup,
  lang: string
): Promise<Partial<ReportContent>> {
  const raw = await callClaude(client, buildWriterPrompt(group, lang), JSON.stringify(brief), 1600)
  const parsed = JSON.parse(sanitizeJsonControlCharacters(stripJsonFence(raw)))
  const result: Partial<ReportContent> = {}
  for (const key of group.keys) {
    const value = parsed[key]
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`writer ${group.role} returned no content for ${key}`)
    }
    result[key] = value
  }
  return result
}

export async function rewriteReportForClient(
  report: ReportContent,
  lang: string,
  clientFirstName: string
): Promise<ReportContent> {
  const apiKey = await getAnthropicApiKey()
  if (!apiKey) {
    // No silent raw-text fallback: a missing key must surface as a failure so stage2's
    // retry-via-requeue picks it up, rather than quietly shipping unrewritten clinical text.
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 })

  const brief = await runPlanner(client, report, clientFirstName)

  const [a, b, c] = await Promise.all(
    WRITER_GROUPS.map((group) => runWriter(client, brief, group, lang))
  )

  return {
    ...a,
    ...b,
    ...c,
    section_14_recommendations: report.section_14_recommendations,
  } as ReportContent
}
