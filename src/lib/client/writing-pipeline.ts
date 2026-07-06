import Anthropic from '@anthropic-ai/sdk'
import type { ReportContent, ReportSectionKey } from '@/types/report'
import { REPORT_SECTION_KEYS, PRACTITIONER_ONLY_SECTION_KEYS } from '@/types/report'

const MODEL = 'claude-sonnet-4-6'

function languageName(lang: string): string {
  if (lang === 'de') return 'German'
  if (lang === 'es') return 'Spanish'
  return 'English'
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
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  const block = response.content.find((b) => b.type === 'text')
  return block?.type === 'text' ? block.text.trim() : ''
}

// Claude sometimes wraps JSON in a markdown fence despite instructions not to — strip it
// before parsing rather than failing the whole call over a formatting slip.
function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced ? fenced[1] : trimmed
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
  dominantPattern: string
  mainDriver: string
  symptomFindingMap: string[]
  systemVerdicts: Record<BriefSystemKey, SystemVerdict>
  crossSystemLinks: string[]
  safety: { flags: string[]; constraint: string | null }
}

function parseBrief(raw: string): ClientReportBrief {
  const parsed = JSON.parse(stripJsonFence(raw))
  if (
    typeof parsed.dominantPattern !== 'string' ||
    typeof parsed.mainDriver !== 'string' ||
    typeof parsed.systemVerdicts !== 'object' ||
    parsed.systemVerdicts === null
  ) {
    throw new Error('invalid_brief_shape')
  }
  return {
    dominantPattern: parsed.dominantPattern,
    mainDriver: parsed.mainDriver,
    symptomFindingMap: Array.isArray(parsed.symptomFindingMap) ? parsed.symptomFindingMap : [],
    systemVerdicts: parsed.systemVerdicts,
    crossSystemLinks: Array.isArray(parsed.crossSystemLinks) ? parsed.crossSystemLinks : [],
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
  "safety": {
    "flags": string[] — any of these you find real evidence for in the report: low body weight, low BMI, elderly and low weight, pregnancy, eating-disorder history, diabetes, any serious diagnosed condition. Empty array if none,
    "constraint": string | null — "gentle support only, no fasting or aggressive protocols" if flags is non-empty, otherwise null
  }
}
Base every field only on what the report actually supports — never invent a finding, a symptom, or a link that is not there. If you are unsure whether a safety flag applies, leave it out.`

async function runPlanner(client: Anthropic, report: ReportContent): Promise<ClientReportBrief> {
  const raw = await callClaude(client, PLANNER_SYSTEM_PROMPT, JSON.stringify(report), 1200)
  return parseBrief(raw)
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
Warm, direct, confident — like a knowledgeable friend who is sure the client can get better. Always talk TO the person ("your liver is running slow"), never about a chart ("the liver shows reduced efficiency"). Open a finding with a short plain verdict, then the effect, then the direction of the fix. Be concrete about the DO: how, how often, how long. Be confident about the PROBLEM and optimistic about the RECOVERY — that extra confidence covers terrain and action only, never a disease or a lab claim. No alarm words, no shouting capitals, no catastrophe language.
Style dial — land in the MIDDLE. Too soft: "Your kidneys and adrenals show room to improve filtration and hormone production, a balancing pattern that responds well to support." Too hard: "Your adrenals are weak and toxic — reduce all stress and take adaptogens." Target: "Your stress glands are worn down from running on high for too long, and that's behind the fatigue and the poor sleep. As your nervous system settles they recover — calm, steady support is what turns this around."

ASSERT VS REDIRECT:
Assert plainly, as fact, anything iridology genuinely reads: colon congestion, liver sluggishness, lymphatic stasis, adrenal strain, nervous-system tension, digestive weakness, constitutional type. Redirect to a doctor — phrase as "worth checking with your doctor", never as a stated fact — anything only a lab, blood test, or scan could confirm, and any disease name, consequence, or prognosis: cholesterol level, arterial plaque, "toxic blood", stroke or heart-attack risk, thyroid hormone numbers, blood sugar or diabetes, cancer, anaemia severity, active infection. The extra voice confidence never overrides this line.

SAFETY GATE:
If the brief's safety.flags array is non-empty, do not suggest fasting, aggressive cleanses, parasite protocols, or protein restriction in any section you write. Use gentle, moderate language for any lifestyle direction.

SELF-CHECK (run silently on your own output before returning):
1. Any sentence describing the eye (colour, shape, structure)? Delete the description, keep only the meaning.
2. Does every sentence pass the value rule (a/b/c)? Cut anything that does not.
3. Any lab, disease, or prognosis asserted instead of redirected? Fix it.
4. Is the voice at the target level — warm and direct, not soft, not alarmist?
5. If safety.flags is non-empty, does every lifestyle direction stay gentle?

Return ONLY a JSON object, no commentary, no markdown fences. The object's keys must be exactly the section keys listed above, each holding the finished prose for that section.`

function sectionInstructions(key: ReportSectionKey): string {
  switch (key) {
    case 'section_1_general_terrain':
      return 'section_1_general_terrain: open with the big picture — brief.dominantPattern, the ONE main driver (brief.mainDriver), and the overall message. This is where the through-line lives.'
    case 'section_11_detected_axes':
      return "section_11_detected_axes: state each entry in brief.crossSystemLinks in plain words, once. If brief.crossSystemLinks is empty, write one honest line saying no notable cross-system pattern stood out."
    case 'section_12_conclusion':
      return "section_12_conclusion: tell the recovery story and the order of priorities, using brief.dominantPattern, brief.mainDriver, and brief.systemVerdicts. Do not repeat the other sections. If brief.safety.flags is non-empty, end this section with exactly: \"Check with your doctor before any fasting or intensive cleanse.\""
    case 'section_13_strengths_of_the_body':
      return "section_13_strengths_of_the_body: name what's holding up well, drawn from any brief.systemVerdicts entries marked \"fine\". Motivating and true."
    default:
      return `${key}: use brief.systemVerdicts["${key}"] — a short plain verdict, then what it causes for the client, then the direction of the fix. Cover the system even when its verdict is "fine" (one honest line).`
  }
}

function buildWriterPrompt(group: WriterGroup, lang: string): string {
  const roleLine = `You are Writer ${group.role}. Write in ${languageName(lang)}. You are writing part of a client-facing iridology report for someone with zero health knowledge — think of a gardener reading it once and acting on it. Never mention the iris, its colour, shape, or structure. You write exactly these sections, using the shared BRIEF you are given as your only source: ${group.keys.join(', ')}.`
  const perSection = group.keys.map(sectionInstructions).join('\n')
  return `${roleLine}\n\n${perSection}\n\n${SHARED_WRITER_RULES}`
}

async function runWriter(
  client: Anthropic,
  brief: ClientReportBrief,
  group: WriterGroup,
  lang: string,
  fallback: ReportContent
): Promise<Partial<ReportContent>> {
  try {
    const raw = await callClaude(client, buildWriterPrompt(group, lang), JSON.stringify(brief), 1600)
    const parsed = JSON.parse(stripJsonFence(raw))
    const result: Partial<ReportContent> = {}
    for (const key of group.keys) {
      const value = parsed[key]
      result[key] = typeof value === 'string' && value.trim().length > 0 ? value : fallback[key]
    }
    return result
  } catch {
    const result: Partial<ReportContent> = {}
    for (const key of group.keys) result[key] = fallback[key]
    return result
  }
}

export async function rewriteReportForClient(
  report: ReportContent,
  lang: string
): Promise<ReportContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Practitioner-only sections must never reach client_report_content, even on this
    // early-exit path where no rewriting happens at all.
    const safe = { ...report }
    for (const key of PRACTITIONER_ONLY_SECTION_KEYS) delete safe[key]
    return safe
  }

  const client = new Anthropic({ apiKey })

  let brief: ClientReportBrief | null = null
  try {
    brief = await runPlanner(client, report)
  } catch {
    brief = null
  }

  if (!brief) {
    // No brief means the three writers have nothing to work from — fall back to the raw,
    // practitioner-voiced text for every client-facing section rather than spending 3 more
    // calls writing from nothing.
    const safe: ReportContent = {}
    for (const key of REPORT_SECTION_KEYS) safe[key] = report[key]
    return safe
  }

  const [a, b, c] = await Promise.all(
    WRITER_GROUPS.map((group) => runWriter(client, brief, group, lang, report))
  )

  return {
    ...a,
    ...b,
    ...c,
    section_14_recommendations: report.section_14_recommendations,
  } as ReportContent
}
