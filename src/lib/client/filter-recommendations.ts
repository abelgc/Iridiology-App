import type { Lang } from '@/lib/i18n'

// Groups vitamins/minerals/herbs from the AI's per-organ blocks in section_14_recommendations
// into one deduplicated list per kind, so the client sees each supplement once (with the
// organs it supports) instead of once per organ that happens to share it. Also applies the
// existing tier restriction (basic tier never sees minerals/herbs). Used identically by the
// web report viewer and the PDF renderer.
const RECOMMENDATION_KINDS = ['Vitamins', 'Minerals', 'Herbs'] as const
type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number]

// Keep in sync with RECOMMENDATION_LABELS in src/lib/claude/prompts.ts — the model is
// instructed to use these exact per-language prefixes, so this parser must recognise all
// three and the renderer must localize the output header to the requested lang.
const KIND_LABELS: Record<RecommendationKind, Record<Lang, string>> = {
  Vitamins: { en: 'Vitamins', es: 'Vitaminas', de: 'Vitamine' },
  Minerals: { en: 'Minerals', es: 'Minerales', de: 'Mineralien' },
  Herbs: { en: 'Herbs', es: 'Hierbas', de: 'Kräuter' },
}

function normalizeItemName(item: string): string {
  return item.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function consolidateRecommendationsForTier(text: string | undefined, isPremium: boolean, lang: Lang = 'en'): string {
  if (!text) return ''

  const organBlocks = text.split(/\n(?=\*\*[^*]+\*\*)/)
  const byKind = new Map<RecommendationKind, Map<string, { label: string; organs: string[] }>>(
    RECOMMENDATION_KINDS.map((kind) => [kind, new Map()])
  )

  for (const block of organBlocks) {
    const organMatch = block.match(/^\*\*([^*]+)\*\*/)
    if (!organMatch) continue
    const organ = organMatch[1].trim()

    for (const kind of RECOMMENDATION_KINDS) {
      if (kind !== 'Vitamins' && !isPremium) continue
      const prefixes = Object.values(KIND_LABELS[kind])
      const lineMatch = block.match(new RegExp(`^(?:${prefixes.join('|')}):[ \\t]*(.+)$`, 'm'))
      if (!lineMatch) continue
      const items = lineMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
      const group = byKind.get(kind)!
      for (const item of items) {
        const key = normalizeItemName(item)
        const existing = group.get(key)
        if (existing) {
          if (!existing.organs.includes(organ)) existing.organs.push(organ)
        } else {
          group.set(key, { label: item, organs: [organ] })
        }
      }
    }
  }

  const sections = RECOMMENDATION_KINDS.map((kind) => {
    const entries = [...byKind.get(kind)!.values()]
    if (entries.length === 0) return null
    const lines = entries.map((entry) => `- ${entry.label} — ${entry.organs.join(', ')}`)
    return `**${KIND_LABELS[kind][lang]}**\n${lines.join('\n')}`
  }).filter((section): section is string => section !== null)

  return sections.length > 0 ? sections.join('\n\n') : text
}
