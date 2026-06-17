import Anthropic from '@anthropic-ai/sdk'
import type { ReportContent, ReportSectionKey } from '@/types/report'
import { REPORT_SECTION_KEYS } from '@/types/report'

const MODEL = 'claude-sonnet-4-6'

async function callClaude(client: Anthropic, systemPrompt: string, userContent: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  const block = response.content.find((b) => b.type === 'text')
  return block?.type === 'text' ? block.text.trim() : ''
}

async function rewriteSection(client: Anthropic, rawText: string, lang: string): Promise<string> {
  // Agent 1: Analyst — extract structured finding (read-only)
  const analystOut = await callClaude(
    client,
    `You are an iridology clinical analyst. Extract the key finding from this report section as structured data.
Return JSON only: { "finding": "...", "bodySystem": "...", "clinicalObservation": "..." }
Do NOT interpret or editorialize. Extract only what is stated. Return valid JSON and nothing else.`,
    rawText
  )

  let structured: { finding: string; bodySystem: string; clinicalObservation: string }
  try {
    structured = JSON.parse(analystOut)
  } catch {
    structured = { finding: rawText, bodySystem: 'unknown', clinicalObservation: rawText }
  }

  // Agent 2: Translator — plain language for non-medical client
  const translatorOut = await callClaude(
    client,
    `You are a health communicator writing for non-medical clients. Write in ${lang === 'es' ? 'Spanish' : 'English'}.
Convert this clinical iridology finding into plain language a non-doctor can understand.
Focus on: what this means for the client's body or health experience.
STRICTLY FORBIDDEN terms (remove all): iris, iridology, fiber, fibers, zone, zones, sector, sectors, pigment, pigmentation, lacunar, lacunae, stromal, collarette, rosette, constitution, constitutional, density, texture, formation, crypta, crypt, radii, solaris, pupillary, ciliary, sclera, observation, exam, analysis, assessment, indicator.
Preserve any inter-system connections stated in the original. If the original links two body systems (e.g., liver and digestion), reflect that link in plain language (e.g., "your liver and digestive system are both working under strain"). These connections are clinically meaningful and must survive the translation.
Also preserve any health meaning derived from colour or from the white of the eye: the original may read a colour or a scleral sign as a health pattern (for example a brown tone over the liver area meaning the liver is processing a heavy load, or yellowing meaning kidney or gallbladder strain). Drop the colour word if needed, but never drop what it means for the client's body.
Write 2-3 sentences maximum. Return only the plain text, no JSON.`,
    JSON.stringify(structured)
  )

  // Agent 3: Editor — enforce rules
  const editorOut = await callClaude(
    client,
    `You are an editor enforcing strict communication rules for a client-facing health report. Write in ${lang === 'es' ? 'Spanish' : 'English'}.
Apply these rules:
- NO fiber descriptions (fiber density, fiber structure, iris zone numbers)
- NO technical jargon a non-doctor would not understand
- NO vague or hedging language (may, could suggest, might be, it is possible that, perhaps)
- NO severity over-escalation: do not write "severely", "dangerously", "complete failure", "breakdown", "collapsed", or "destroyed" — use moderate, functional language (under strain, reduced capacity, working harder than usual)
- Every sentence must carry direct interpretive value for the client
- Maximum 2 sentences total
- Tone: clinical but human — say what it means for the client, not what was observed
If the text passes all rules, return it unchanged. If it fails, rewrite to comply.
Return ONLY the final text, nothing else.`,
    translatorOut
  )

  // Agent 4: QA — final gate
  const qaOut = await callClaude(
    client,
    `You are a QA reviewer for a client-facing health report. Write in ${lang === 'es' ? 'Spanish' : 'English'}.
Check every sentence against these rules:
1. No fiber/zone/sector/iris observation language
2. No hedging words: may, might, could, possibly, perhaps, it seems
3. Every sentence directly tells the client something about their health
4. Maximum 2 sentences
5. Tone is direct and human, not clinical
6. No severity over-escalation: "severely", "dangerously", "failure", "breakdown", "collapsed" are forbidden — rewrite with moderate language
7. If the original text connected two body systems, confirm that connection is still present in plain language
8. If the original conveyed a health meaning from a colour or from the white of the eye, confirm that meaning is still present in plain language
For each sentence that FAILS: rewrite it to pass.
For each sentence that PASSES: keep it exactly as-is.
Return ONLY the final approved text. No commentary, no explanations.`,
    editorOut
  )

  return qaOut || editorOut || translatorOut || rawText
}

export async function rewriteReportForClient(
  report: ReportContent,
  lang: string
): Promise<ReportContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return report

  const client = new Anthropic({ apiKey })

  const rewrites = await Promise.all(
    REPORT_SECTION_KEYS.map(async (key: ReportSectionKey) => {
      try {
        const rewritten = await rewriteSection(client, report[key], lang)
        return [key, rewritten || report[key]] as const
      } catch {
        // Per-section fallback: keep original on any error
        return [key, report[key]] as const
      }
    })
  )

  return Object.fromEntries(rewrites) as ReportContent
}
