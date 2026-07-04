// Strips Minerals:/Herbs: lines from a section_14_recommendations block for non-premium
// (basic tier) clients. Organ headers and Vitamins: lines survive. Used identically by the
// web report viewer and the PDF renderer so basic-tier clients never receive minerals/herbs
// through either channel.
export function filterRecommendationsForTier(text: string | undefined, isPremium: boolean): string {
  if (!text) return ''
  if (isPremium) return text
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('Minerals:') && !trimmed.startsWith('Herbs:')
    })
    .join('\n')
}
