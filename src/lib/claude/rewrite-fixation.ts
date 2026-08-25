import type { AIProvider } from '@/lib/ai/types'
import type { ReportContent } from '@/types/report'
import { detectDominantSystemFixation, detectHistoryCallbackOveruse } from './detect-fixation'
import { sanitizeJsonControlCharacters } from './json-repair'

/**
 * Deterministic safety net for the SYSTEM CONNECTIONS prompt cap (see prompts.ts): if the
 * model didn't self-enforce the "no system as causal driver in more than 2 sections" rule,
 * this rewrites the excess sections in one targeted call — grounding each in its own primary
 * finding instead of the over-used hub system. Sections beyond the first 2 flagged are the
 * ones rewritten; the first 2 stay, since the prompt's own cap allows up to 2.
 *
 * Costs nothing when the model already respected the cap (the common case) — one extra call
 * only fires when it didn't. Any failure (network, bad JSON) falls back to the untouched
 * report rather than throwing — worst case is the same fixation the guard was meant to catch,
 * never a broken report.
 */
export async function guardAgainstSystemFixation(
  provider: AIProvider,
  report: ReportContent,
): Promise<ReportContent> {
  const flag = detectDominantSystemFixation(report)
  if (!flag) return report

  const sectionsToRewrite = flag.sections.slice(2)
  if (sectionsToRewrite.length === 0) return report

  const systemPrompt = `You are a clinical iridologist fixing a specific problem in a report you already wrote: the "${flag.hub}" system was named as the causal driver in too many sections, crowding out other findings. You do not have the iris images in this pass — you are revising existing clinical text, not re-analysing the eyes.

TASK: Rewrite ONLY these sections, replacing their connection to ${flag.hub} with a connection grounded in that section's OWN primary finding instead — use only evidence already present in that section's existing text, never invent a new finding: ${sectionsToRewrite.join(', ')}.

Keep the same clinical voice, length, and severity calibration as the original. Every other fact in the section must stay as written — you are correcting one dependency, not rewriting the section from scratch. If a section genuinely has no independent finding to connect from, state that this system is currently stable rather than reaching for another forced connection.

Respond with ONLY a valid JSON object containing exactly these keys, no markdown fences, no commentary: ${sectionsToRewrite.join(', ')}.`

  const userText = JSON.stringify(
    Object.fromEntries(sectionsToRewrite.map((key) => [key, report[key]])),
  )

  try {
    const response = await provider.complete({ systemPrompt, userText, images: [], maxTokens: 4096 })
    const cleaned = response.text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    const parsed = JSON.parse(sanitizeJsonControlCharacters(cleaned)) as Partial<ReportContent>

    const result = { ...report }
    for (const key of sectionsToRewrite) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim().length > 0) result[key] = value
    }
    return result
  } catch {
    return report
  }
}

/**
 * Deterministic safety net for history-callback overuse (see detect-fixation.ts): if too
 * many sections explain themselves by calling back to what the patient already reported
 * instead of their own iris-grounded finding, this rewrites the excess sections — same
 * shape as guardAgainstSystemFixation above, on the condition-agnostic axis it can't see.
 */
export async function guardAgainstHistoryCallbackOveruse(
  provider: AIProvider,
  report: ReportContent,
): Promise<ReportContent> {
  const flag = detectHistoryCallbackOveruse(report)
  if (!flag) return report

  const sectionsToRewrite = flag.sections.slice(2)
  if (sectionsToRewrite.length === 0) return report

  const systemPrompt = `You are a clinical iridologist revising a report you already wrote because it leans too often on the patient's own reported history as the explanation, instead of each section's own iris-grounded finding. You do not have the iris images in this pass — you are revising existing clinical text, not re-analysing the eyes.

TASK: Rewrite ONLY these sections, removing the explicit callback to what the patient already told you and restating the finding in this section's own already-stated terms instead — use only evidence already present in that section's existing text, never invent a new finding: ${sectionsToRewrite.join(', ')}.

Do not deny or contradict the patient's history — simply stop making it the explanation. Keep the same clinical voice, length, and severity calibration as the original. If a section genuinely has no independent finding once the callback is removed, state that this system currently shows no notable pattern rather than reaching for the patient's own words again.

Respond with ONLY a valid JSON object containing exactly these keys, no markdown fences, no commentary: ${sectionsToRewrite.join(', ')}.`

  const userText = JSON.stringify(
    Object.fromEntries(sectionsToRewrite.map((key) => [key, report[key]])),
  )

  try {
    const response = await provider.complete({ systemPrompt, userText, images: [], maxTokens: 4096 })
    const cleaned = response.text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    const parsed = JSON.parse(sanitizeJsonControlCharacters(cleaned)) as Partial<ReportContent>

    const result = { ...report }
    for (const key of sectionsToRewrite) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim().length > 0) result[key] = value
    }
    return result
  } catch {
    return report
  }
}
