import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { getAnthropicApiKey } from '@/lib/ai/get-provider'
import { isNonRetryableAIError } from '@/lib/ai/errors'
import { sanitizeJsonControlCharacters } from '@/lib/claude/json-repair'
import { stripDashesFromReport } from '@/lib/claude/strip-dashes'
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

// `findings` (2026-10-05): one plain-language conclusion per distinct iris finding the report
// states for that system, including explicit absences ("no lymphatic rosary"). The single
// `clue` used to be the only carrier, and secondary findings never survived the Planner.
type SystemVerdict = { verdict: 'needs-action' | 'fine'; clue: string; findings?: string[] }

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

// The only sections eligible to own a known diagnosis: the 9 tracked systems plus
// section_1, which Writer A also writes (see WRITER_GROUPS below).
type KnownDiagnosisSection = BriefSystemKey | 'section_1_general_terrain'

type KnownDiagnosis = { condition: string; assignedSection: KnownDiagnosisSection; severity: 'soft' | 'hard' }

type ClientReportBrief = {
  clientFirstName: string
  dominantPattern: string
  mainDriver: string
  symptomFindingMap: string[]
  systemVerdicts: Record<BriefSystemKey, SystemVerdict>
  crossSystemLinks: string[]
  knownDiagnoses: KnownDiagnosis[]
  // The practitioner report's own section 13, one entry per strength. Without this field
  // Writer C rebuilt section 13 from "fine" verdicts alone and lost four of five strengths
  // on the Heidrun Schwarzenberger handout (2026-10-05).
  strengths: string[]
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
    // Drop any entry missing either field instead of crashing the whole brief on one
    // malformed item — worst case is that one diagnosis is silently omitted from every
    // writer rather than leaking into one it wasn't assigned to.
    knownDiagnoses: Array.isArray(parsed.knownDiagnoses)
      ? parsed.knownDiagnoses
          .filter(
            (d: unknown): d is Record<string, unknown> =>
              typeof d === 'object' &&
              d !== null &&
              typeof (d as Record<string, unknown>).condition === 'string' &&
              typeof (d as Record<string, unknown>).assignedSection === 'string',
          )
          .map(
            (d: Record<string, unknown>): KnownDiagnosis => ({
              condition: d.condition as string,
              assignedSection: d.assignedSection as KnownDiagnosisSection,
              // Missing or malformed severity defaults to 'hard' — the more cautious
              // option, so a Planner mistake degrades to the doctor-coordination line a
              // hard diagnosis needs, instead of silently dropping it.
              severity: d.severity === 'soft' ? ('soft' as const) : ('hard' as const),
            }),
          )
      : [],
    strengths: Array.isArray(parsed.strengths)
      ? parsed.strengths.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      : [],
    safety: {
      flags: Array.isArray(parsed.safety?.flags) ? parsed.safety.flags : [],
      constraint: typeof parsed.safety?.constraint === 'string' ? parsed.safety.constraint : null,
    },
  }
}

function buildPlannerSystemPrompt(lang: string): string {
  return `You are the Planner for a client iridology report. You read the full hidden clinical report below — a JSON object, one field per section, written for a practitioner. It may contain iris, zone, fibre, and other clinical language. You never write client-facing prose yourself. You extract a compact BRIEF that three writers will use instead of the full report.

Return ONLY a JSON object, no commentary, no markdown fences, with exactly these keys:
{
  "dominantPattern": string — the single dominant pattern across the whole case,
  "mainDriver": string — the system or pattern the report's own iris evidence most strongly and consistently supports as dominant. Base this on iris-grounded findings, not on which condition the patient happened to mention — a patient-reported diagnosis is not automatically the driver unless the report's own findings independently point there too,
  "symptomFindingMap": string[] — each reported symptom tied to the one finding that explains it, one short string per pair, e.g. "fatigue -> adrenal strain",
  "systemVerdicts": {
    "section_2_emotional_field": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] },
    "section_3_cognitive_nervous": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] },
    "section_4_immune_lymphatic": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] },
    "section_5_endocrine_hormonal": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] },
    "section_6_circulatory_cardiorespiratory": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] },
    "section_7_hepatic": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] },
    "section_8_digestive_intestinal": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] },
    "section_9_renal_urinary": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] },
    "section_10_structural_integumentary": { "verdict": "needs-action" | "fine", "clue": string, "findings": string[] }
  },
  "crossSystemLinks": string[] — each cross-system connection stated ONCE, in plain internal language, e.g. "liver strain is compounding the digestive load",
  "strengths": string[] — every strength the report's own strengths section (section_13_strengths_of_the_body) states, one entry per strength, as a plain-language conclusion about the body (for example "dense, well-woven tissue structure", "even upper nervous regulation", "no cholesterol or sodium ring"). Carry every one; never merge, rank, or drop one. Empty array only if that section is genuinely empty,
  "knownDiagnoses": { condition: string, assignedSection: string, severity: "soft" | "hard" }[] — conditions the client themself mentioned about their own history (for example "the patient reports a history of...", "the patient states they have...") — NEVER a condition the report presents as something this iris reading found or detected, and never treat the client's own wording as proof a doctor diagnosed it. Only include it if the report's own wording clearly frames it as something the client already said about themselves AND ties it to a finding in that section. If the report says the condition is not corroborated by the iris, has no residual marker, is not carried forward, or words to that effect, leave it out of knownDiagnoses entirely: the client handout then says nothing about it. For each one, assignedSection must be the SINGLE section key (one of the systemVerdicts keys above, or "section_1_general_terrain") where the report's own text most directly and specifically ties that condition to a finding — not every section that could plausibly relate to it. Each condition may only be assigned to one section; if the report ties it to several, pick the section with the strongest, most specific textual link and leave it out of the others. Empty array if none, or if you are unsure. severity must be "hard" for a named diagnosis with real medical stakes — doctor-confirmed, involves or led to surgery, a lab or hormone-based condition, or anything only a doctor can manage (example: "hyperparathyroidism", "diagnosed with diabetes"). severity must be "soft" for a historical, uncertain, or tendency-type self-report that is not a formal diagnosis with real medical stakes, even when it lines up with a real constitutional or functional weakness finding (example: "possible childhood asthma, unclear if still active", "occasional childhood eczema"). If genuinely unsure which it is, use "hard" — the more cautious option.
  "safety": {
    "flags": string[] — any of these you find real evidence for in the report: low body weight, low BMI, elderly and low weight, pregnancy, eating-disorder history, diabetes, any serious diagnosed condition. Empty array if none,
    "constraint": string | null — "gentle support only, no fasting or aggressive protocols" if flags is non-empty, otherwise null
  }
}
Base every field only on what the report actually supports — never invent a finding, a symptom, a diagnosis, or a link that is not there. If you are unsure whether a safety flag or a diagnosis applies, leave it out.

Each systemVerdicts findings array holds one entry per distinct conclusion the report states for that system, in plain internal language: the main finding, each secondary finding (an absorption pattern, a reduced-uptake sign, a standalone marker), and each explicit absence the report states (for example "no lymphatic rosary", "no cholesterol ring"). Carry every one, in the report's own order; a stated absence is a finding too. Never add a conclusion the report does not state. The clue remains the one-line summary of the main finding.

Each systemVerdicts clue must preserve any concrete body location, organ, or zone the source text ties to that system's finding — e.g. "pelvic and digestive area", "lower back and hips", "throat and thyroid region" — never compress a finding down to only the abstract pattern (e.g. "internalized tension") while dropping where in the body it actually shows up. If the source genuinely names no specific location for that system, leave the clue as the pattern alone — never invent one.

For "section_2_emotional_field" specifically: if the source text names a specific chakra (e.g. "Root Chakra") and/or a specific emotion to work with, the clue MUST quote both names verbatim — never paraphrase, generalize, or drop them. This is a paid detail the client is specifically promised.

LANGUAGE: Write every string value in your JSON response — dominantPattern, mainDriver, each symptomFindingMap entry, every clue, each crossSystemLinks entry, each knownDiagnoses entry's condition string, and safety.constraint — in ${languageName(lang)}. assignedSection values are section-key identifiers, not prose — always leave them in English exactly as listed above, never translate them. The source report above may already be in ${languageName(lang)}; keep it in that language, never translate or drift into English.`
}

async function runPlanner(
  client: Anthropic,
  report: ReportContent,
  clientFirstName: string,
  lang: string
): Promise<ClientReportBrief> {
  const systemPrompt = buildPlannerSystemPrompt(lang)
  const userContent = JSON.stringify(report)
  try {
    const raw = await callClaude(client, systemPrompt, userContent, 1200)
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
    const raw = await callClaude(client, systemPrompt, userContent, 1200)
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

const SHARED_WRITER_RULES = `LANGUAGE IN EXAMPLES:
Every worked example, connector phrase, and forbidden-word pair below is written in English to show MEANING only. When you are writing in a different language (per the Writer role line above), translate every one of them into that language's natural equivalent — never copy an English word or phrase (such as "fits with") verbatim into a non-English sentence. This applies to every example in these rules without exception.

LAYER MODEL:
The brief you receive is hidden Layer 1 reasoning (zones, clock positions, fibre, pigment, constitution, axes) — it never appears in your output. You write Layer 2: the client report. State CONCLUSIONS as facts about the client's body. Never write "the iris", "the zone", "ciliary", "collarette", "wreath", "fibre", "lacuna", "pigment", "o'clock", "arc", or any colour or shape of the eye. Say "your liver", "your colon", "your nervous system". Every sentence you write is the LAST link of a hidden chain, never the chain itself.

THE VALUE RULE:
Every sentence must do ONE of: (a) say what is happening in a named organ, gland, or system of their body, or (b) say what they feel because of it, only when the brief itself states that sensation or symptom. If a sentence does neither, cut it. Delete on sight: any description of the eye (colour, shape, tone, structure); mechanism and physiology; generic health lessons not about this person; any instruction, remedy, or lifestyle suggestion (see NO ADVICE); anything already said elsewhere. One idea per sentence, about 15 to 20 words per sentence. A system that needs action gets 2 to 4 sentences; a system that is fine gets one honest line. Carry every entry of that system's findings array into prose, including the stated absences, each in its own sentence or clause; never collapse several findings into one.
Worked example, delete: "Both irises present a biliary constitution, the base colour is a mixed yellow-green-brown tone across the full stroma." Keep instead: "Your body naturally leans toward a liver-and-lymph type, so those systems work hardest."

NO ADVICE:
The handout carries no advice. The practitioner gives personalised advice in person, in the consultation; this document reports what the reading found and nothing more. Never write what to eat, drink, avoid, breathe, brush, move, rest, warm, or practise. Never write a remedy, a routine, a habit, or a product. Never write "support", "helps", "responds well to", or "worth keeping in view" as a way to smuggle a suggestion in. If the brief does not state a recommendation (the one exception is the chakra and emotion named for section_2_emotional_field, which is a paid detail), there is none to write. A section that needs action still ends on its finding, not on a suggestion.

REGISTER:
Professional plain language, between a clinical report and a magazine. Keep every gland, axis, organ, and system name the brief uses (hypothalamic-pituitary-pineal regulation, autonomic supply to the gut and pelvis, bile flow, lymphatic drainage, adrenal reserve); a client can hear a gland name. Drop every iris word (see LAYER MODEL). No metaphors, no similes, no "almost like", no "simply fine", no "the all-clear", no invented sensations the brief does not state, no filler reassurance. Where the brief is silent, the handout is silent: silence is better than a flourish. Example of the register wanted: "The upper regulation of your nervous system, the hypothalamic-pituitary-pineal axis, holds an even tone. The strain sits lower, in the autonomic supply to your gut and pelvis, which has been under sustained demand."

NO DASHES:
Never use an em-dash or an en-dash anywhere in your output. Write a comma, a full stop, or the word "to" for a range instead. The examples in these rules show meaning only; do not copy their punctuation.

VOICE:
Direct, categorical, priority-first, confident about the PROBLEM, optimistic about RECOVERY. Talk TO the person ("your liver is running slow"), never about a chart ("the liver shows reduced efficiency"). Open every section with the main finding as a short confident verdict, then what it connects to, then why it matters or its priority. No alarm words, no capitals, no catastrophe.
Dial, land in the MIDDLE. Too soft: "Your kidneys and adrenals show room to improve filtration and hormone production, a balancing pattern that responds well to support." Too hard: "Your adrenals are weak and toxic, reduce all stress and take adaptogens." Target: "Your adrenal glands are worn down from running on high too long, and that sits behind your fatigue and poor sleep."

NO GENERIC LABELS:
Never open or describe a system with generic filler like "this system needs attention", "requires attention", or "needs some care" — the client is already giving it attention by reading this report. Skip straight to the specific finding: name what is actually happening in that system, not that it deserves notice.

ASSERT VS REDIRECT:
Assert plainly, as fact, terrain iridology genuinely reads: colon congestion, liver sluggishness, lymphatic stasis, adrenal strain, nervous-system tension, digestive weakness, constitutional type, load, priority order. Never assert — only as something to keep in view with their doctor, written per HOW A REDIRECT IS WRITTEN below — a disease name, organ damage, hormone/cholesterol/blood-sugar levels, parasites, "toxins" in an organ, toxic blood, blood-flow abnormality, or structural integrity; anything only a lab, blood test, or scan could confirm. Causation stays soft, in whatever language you are writing — express it as a plausible contributing link (not certainty), in that language's own natural phrasing; never at the strength of "proves / explains / confirms" or that language's equivalent. The voice confidence above never overrides this line.
Forbidden → use instead: toxic / failing / damaged / blocked / severely affected / weak organ / dangerous → under strain / carrying extra load / sluggish / needs support / reduced resilience / a priority area.

HOW A REDIRECT IS WRITTEN:
A redirect to a doctor is ONE sentence, at the END of the section, never its opening and never its headline. Lead with what the reading DID find; the doctor line follows it.
Assume nothing about whether they have already seen a doctor. Many clients are here precisely because they went, came away without an answer, and are looking for another angle — telling that person to go to a doctor reads as not having listened to them. So never phrase it as a step they have skipped or as the thing that comes first. Phrase it as something to hold in view alongside this work: "that side of it is worth keeping in view with your doctor too — what follows here works alongside that." Same register as the KNOWN DIAGNOSES rule below.
Never write a sentence whose effect is to tell the client this reading is not up to the job — no "this is not something this kind of reading can assess", no "only a doctor can tell", no "this is beyond what I can see". Redirect the one claim you cannot make; never disown the reading itself.
No urgency: never "soon", "without waiting", "promptly", "as soon as possible", "don't delay", "urgent", "immediately". A symptom the client reported is a reason to name the finding, not a reason to escalate.

KNOWN DIAGNOSES:
brief.knownDiagnoses only ever contains conditions already assigned to a section you are writing — the underlying analysis only keeps a historical condition here when the iris independently showed a matching pattern in that specific zone, so citing it is never just repeating what the client said.
Lead every mention with the SPECIFIC iris-grounded finding — the zone, the pattern, the mechanism, in plain body language — drawn from brief.systemVerdicts' clue and brief.symptomFindingMap for that system. Only after stating the finding, name the condition once, briefly, as what that finding is consistent with. e.g., in English for illustration only — translate fully into the report's language: "Your nervous system's upper regulatory zone is running with reduced reserve — the kind of pattern that shows up as the focus and follow-through difficulties associated with ADHD." Never lead with the condition name. Never write "Since you've mentioned [condition]" or "that lines up with what shows here" or any equivalent phrase in any language — these restate the client's own words back at them instead of explaining anything new.
Do not append a doctor-referral sentence for a known diagnosis, soft or hard — the practitioner handles that conversation directly, not this report. Point to this report's own recommendations for that zone as the way to reinforce it instead.
Do not reach for a known diagnosis to explain a different section just because it also feels related — if it isn't in your brief for that section, it wasn't assigned there.

SAFETY GATE:
If brief.safety.flags is non-empty, do not suggest fasting, aggressive cleanses, parasite protocols, or protein restriction in any section you write. Use gentle, moderate language for any lifestyle direction.

NEVER ADVISE PORTION SIZE OR MEAL FREQUENCY (always, not only when safety flags are set):
Never tell the client how much or how often to eat. Forbidden in every section: "small frequent meals", "eat little and often", "smaller portions", "five or six small meals a day", "reduce portion size", "eat lighter amounts more often", and any rewording that lands in the same place. This leaks most often into the digestive and pancreatic sections and into the conclusion's order of priorities — it is out of bounds in all of them. Write what the brief actually says about that system instead; if the only thing you can reach for is a portion or frequency instruction, write nothing about eating at all.

SELF-CHECK (run silently on your own output before returning):
1. Any sentence describing the eye (colour, shape, structure)? Delete the description, keep only the meaning.
2. Does every sentence pass the value rule (a/b)? Cut anything that does not. Any advice, remedy, routine, or lifestyle suggestion anywhere? Delete it (NO ADVICE). Any em-dash or en-dash? Replace it (NO DASHES). Any gland or system name from the brief replaced by a vaguer phrase? Restore the name (REGISTER). Any entry of a findings array left out? Add it.
3. Any disease, lab level, organ damage, or parasite asserted instead of redirected? Fix it.
4. Any "proves/explains/confirms"-strength language, in any language? Soften it to a plausible contributing-factor phrasing in the language you are writing.
5. If you wrote section_13_strengths_of_the_body, is it free of "healthy/fine/undamaged/disease-free"?
6. If you are Writer A: was the client's first name (if given) used exactly once, warmly, near the opening? If you are Writer B or C: you should not be introducing the client by name.
7. Is the voice at the target level — direct and categorical, not soft, not alarmist?
8. Any generic "needs attention" / "requires attention" filler, or any condition asserted as "already diagnosed"? Fix both per the rules above.
9. Does any section open with, headline, or spend more than one sentence on a doctor referral? Move it to a single closing line. Does it assume the client has not already been to a doctor, or place the doctor before this work rather than alongside it? Rewrite it. Any urgency word, or any sentence saying what this reading cannot do? Delete it.
10. Any instruction about how much or how often to eat? Delete it.
11. Does any known-diagnosis mention lead with the condition name instead of the iris-grounded finding? Does it say "Since you've mentioned" or "that lines up with what shows here"? Does it include a doctor-referral sentence? Fix any of these.
12. If you are NOT writing in English: any English word or phrase from these rules left untranslated inside a non-English sentence? Translate it fully into the report's own language.

Return ONLY a JSON object, no commentary, no markdown fences. The object's keys must be exactly the section keys listed above, each holding the finished prose for that section.`

function sectionInstructions(key: ReportSectionKey, lang: string): string {
  switch (key) {
    case 'section_1_general_terrain':
      return 'section_1_general_terrain: open with the big picture — brief.dominantPattern, the ONE main driver (brief.mainDriver), and the overall message. This is where the through-line lives. If brief.clientFirstName is non-empty, address the client by that first name once, warmly, near the very start, before switching to "you" for the rest of the report; if it is empty, skip the greeting and use "you" from the first sentence.'
    case 'section_11_detected_axes':
      return "section_11_detected_axes (\"Detected Patterns\"): write one \"-\" bullet per entry in brief.crossSystemLinks, in plain words — aim for 5 to 8 when the case supports that many, but never pad beyond what brief.crossSystemLinks actually contains. Not a repeat of the other sections' titles or content. If brief.crossSystemLinks is empty, write one honest line saying no notable cross-system pattern stood out."
    case 'section_12_conclusion':
      return `section_12_conclusion: tell the recovery picture and the order of priorities, which systems carry the load and in what order they matter, as a finding, not as advice, using brief.dominantPattern, brief.mainDriver, and brief.systemVerdicts. Introduce no new findings, do not repeat the other sections, do not add a suggestion. If brief.safety.flags is non-empty, end this section with exactly this line, in ${languageName(lang)}: "${safetyLine(lang)}"`
    case 'section_13_strengths_of_the_body':
      return 'section_13_strengths_of_the_body: carry every entry of brief.strengths into prose, one per sentence, in the same order, keeping each organ, gland, or system name the brief uses; add nothing, drop nothing. If brief.strengths is empty, fall back to the brief.systemVerdicts entries marked "fine". Never write "healthy", "fine", "undamaged", or "disease-free"; say what you\'d expect from a body with real reserve instead, e.g. "your lungs show few patterns and good reserve". Motivating and true.'
    case 'section_2_emotional_field':
      return 'section_2_emotional_field: use brief.systemVerdicts["section_2_emotional_field"], a short plain verdict, then every entry of its findings array, then what it causes for the client only if the brief states it. Cover the system even when its verdict is "fine" (one honest line). If the clue names a specific chakra and/or emotion to work with, state both explicitly by name as a clear, personal recommendation; this is a paid detail the client is specifically promised and the one recommendation this handout carries, never fold it anonymously into generic language. If brief.knownDiagnoses is non-empty for this section, follow the KNOWN DIAGNOSES rule below; never present it as something this reading found and never add a doctor sentence.'
    default:
      return `${key}: use brief.systemVerdicts["${key}"], a short plain verdict, then every entry of its findings array including stated absences, then what it causes for the client only if the brief states it. No advice. Cover the system even when its verdict is "fine" (one honest line). If brief.knownDiagnoses is non-empty for this section, follow the KNOWN DIAGNOSES rule below; never present it as something this reading found and never add a doctor sentence.`
  }
}

function buildWriterPrompt(group: WriterGroup, lang: string): string {
  const roleLine = `You are Writer ${group.role}. Write in ${languageName(lang)}. You are writing part of a client-facing iridology handout for an adult who can hear the name of a gland or a system but must never hear iris anatomy (see REGISTER below). The handout reports findings; it gives no advice (see NO ADVICE below). Never mention the iris, its colour, shape, or structure. You write exactly these sections, using the shared BRIEF you are given as your only source: ${group.keys.join(', ')}.`
  const perSection = group.keys.map((key) => sectionInstructions(key, lang)).join('\n')
  return `${roleLine}\n\n${perSection}\n\n${SHARED_WRITER_RULES}`
}

// A diagnosis only ever reaches the Writer group that owns the section the Planner assigned
// it to — enforced here in code, not left to a per-writer prompt instruction the three
// parallel writers have no way to coordinate on. A writer whose group doesn't own that
// section never sees the condition in its payload at all, so it structurally cannot cite it.
function scopeBriefToGroup(brief: ClientReportBrief, group: WriterGroup): ClientReportBrief {
  const ownedSections = new Set<string>(group.keys)
  return {
    ...brief,
    knownDiagnoses: brief.knownDiagnoses.filter((d) => ownedSections.has(d.assignedSection)),
  }
}

async function runWriter(
  client: Anthropic,
  brief: ClientReportBrief,
  group: WriterGroup,
  lang: string
): Promise<Partial<ReportContent>> {
  const systemPrompt = buildWriterPrompt(group, lang)
  const userContent = JSON.stringify(scopeBriefToGroup(brief, group))

  const attempt = async (): Promise<Partial<ReportContent>> => {
    const raw = await callClaude(client, systemPrompt, userContent, 1600)
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

  try {
    return await attempt()
  } catch (error) {
    if (isNonRetryableAIError(error)) {
      // A 400 invalid_request_error (e.g. exhausted account credit) or a 401 auth error
      // fails identically on a second attempt — don't burn another paid call on a run
      // that was doomed from the first. Same reasoning as runPlanner.
      throw error
    }
    // One retry, mirroring runPlanner: the three writers run in parallel, so one
    // malformed-JSON response takes the whole report down with it. A model trailing
    // prose after its JSON is exactly what broke stage 2 live on 2026-07-26.
    return await attempt()
  }
}

// A hash of everything that actually shapes the output — the Planner prompt and all three
// Writer group prompts (which include SHARED_WRITER_RULES and every sectionInstructions
// case) — for a fixed canonical language. Callers that cache rewriteReportForClient's
// output key their cache by this hash, so a prompt edit (like the 2026-09-22
// known-diagnosis fix) automatically invalidates every previously-cached translation
// instead of relying on someone remembering to clear a cache by hand. 'en' is canonical
// only because the RULES text is identical across languages — only interpolated nouns like
// "English"/"Spanish" differ, which never changes what a fix like this one is checking for.
export function currentPromptVersion(): string {
  const canonical =
    buildPlannerSystemPrompt('en') + WRITER_GROUPS.map((group) => buildWriterPrompt(group, 'en')).join('|')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
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

  const brief = await runPlanner(client, report, clientFirstName, lang)

  const [a, b, c] = await Promise.all(
    WRITER_GROUPS.map((group) => runWriter(client, brief, group, lang))
  )

  // Practitioner rule (2026-10-05): no em-dashes in any report. Deterministic, no model call.
  return stripDashesFromReport({
    ...a,
    ...b,
    ...c,
    section_14_recommendations: report.section_14_recommendations,
  } as ReportContent)
}
