import type { AIProvider } from '@/lib/ai/types'
import type { ReportContent } from '@/types/report'
import { detectZoneDenial } from './detect-zone-denial'
import { sanitizeJsonControlCharacters } from './json-repair'

/**
 * Backstop for the zone-consistency rule. If general terrain already placed a
 * marking in a region and a later section says that region is free of markings,
 * rewrite those sections from the terrain text. This pass has no iris images.
 * It cannot invent a sign terrain did not already name.
 */
export async function guardAgainstZoneDenial(
  provider: AIProvider,
  report: ReportContent,
): Promise<ReportContent> {
  const flag = detectZoneDenial(report)
  if (!flag) return report

  const systemPrompt = `You are a clinical iridologist fixing a report that contradicts a marking already written in general terrain. You do not have the iris images in this pass — you are revising existing clinical text, not re-analysing the eyes.

General terrain already recorded:
${flag.evidence.map((sentence) => `- ${sentence}`).join('\n')}

TASK: Rewrite ONLY these sections so each one accounts for every marking above that falls in its zone. Remove any sentence that says the zone has no lacunae, no furrows, or is otherwise free of those markings: ${flag.sections.join(', ')}.

Use only evidence already present in the section and in the terrain lines above. Never invent a sign, a colour, or a diagnosis that neither text states. Keep the same clinical voice, length, and severity calibration. Every other fact in the section must stay.

Respond with ONLY a valid JSON object containing exactly these keys, no markdown fences, no commentary: ${flag.sections.join(', ')}.`

  const userText = JSON.stringify(
    Object.fromEntries(flag.sections.map((key) => [key, report[key]])),
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
    for (const key of flag.sections) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim().length > 0) result[key] = value
    }
    return result
  } catch {
    return report
  }
}
