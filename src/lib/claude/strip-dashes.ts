import type { ReportContent } from '@/types/report'

/**
 * Deterministic backstop for the practitioner's "no em-dashes" rule (2026-10-05): the
 * prompts tell the model not to write them, and this removes any it still writes.
 *
 * Rules, in order:
 *   1. A dash between two digits is a range: "5–7" becomes "5 to 7".
 *   2. A dash opening a line is a bullet: "— item" becomes "- item".
 *   3. A dash closing a sentence or line is dropped.
 *   4. Any remaining dash, with its surrounding spaces, becomes ", ".
 * Section 14's "Vitamins:" / "Minerals:" / "Herbs:" prefixes are never touched because
 * none of these rules changes the start of a line except rule 2, which only fires on a dash.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1 to $2')
    .replace(/^[—–]\s*/gm, '- ')
    .replace(/\s*[—–]\s*(?=[.!?;:,]|$)/gm, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
}

export function stripDashesFromReport<T extends Partial<ReportContent>>(report: T): T {
  const out: Record<string, unknown> = { ...report }
  for (const [key, value] of Object.entries(report)) {
    if (typeof value === 'string') out[key] = stripDashes(value)
  }
  return out as T
}
