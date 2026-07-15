import { describe, it, expect } from 'vitest'
import { consolidateRecommendationsForTier } from '../filter-recommendations'

const TWO_ORGAN_TEXT = `**Liver**
Vitamins: A, B12, C, E, Niacin
Minerals: Iron, Potassium
Herbs: Dandelion root

**Kidneys**
Vitamins: A, B12, C, E
Minerals: Potassium, Iron
Herbs: Alfalfa`

function parseSections(output: string): Record<string, Record<string, string[]>> {
  const sections: Record<string, Record<string, string[]>> = {}
  for (const block of output.split('\n\n')) {
    const lines = block.split('\n')
    const header = lines[0].match(/^\*\*(.+)\*\*$/)
    if (!header) continue
    const kind = header[1]
    sections[kind] = {}
    for (const line of lines.slice(1)) {
      const item = line.match(/^- (.+?) — (.+)$/)
      if (!item) continue
      sections[kind][item[1]] = item[2].split(', ')
    }
  }
  return sections
}

describe('consolidateRecommendationsForTier', () => {
  it('returns empty string for undefined input', () => {
    expect(consolidateRecommendationsForTier(undefined, true)).toBe('')
  })

  it('dedupes a vitamin shared across organs and lists both organs once', () => {
    const result = consolidateRecommendationsForTier(TWO_ORGAN_TEXT, true)
    const sections = parseSections(result)
    expect(sections.Vitamins['A']).toEqual(['Liver', 'Kidneys'])
  })

  it('is case/whitespace insensitive when matching duplicates', () => {
    const text = `**Liver**\nVitamins: Vitamin D\nMinerals: Zinc\nHerbs: Sage\n\n**Skin**\nVitamins: vitamin d \nMinerals: Zinc\nHerbs: Sage`
    const result = consolidateRecommendationsForTier(text, true)
    const sections = parseSections(result)
    expect(Object.keys(sections.Vitamins)).toEqual(['Vitamin D'])
    expect(sections.Vitamins['Vitamin D']).toEqual(['Liver', 'Skin'])
  })

  it('drops minerals and herbs for non-premium tier but keeps deduped vitamins', () => {
    const result = consolidateRecommendationsForTier(TWO_ORGAN_TEXT, false)
    expect(result).not.toContain('**Minerals**')
    expect(result).not.toContain('**Herbs**')
    expect(result).toContain('**Vitamins**')
  })

  it('falls back to the original text when no organ blocks are found', () => {
    const plain = 'No catalogue-backed recommendation applies this session.'
    expect(consolidateRecommendationsForTier(plain, true)).toBe(plain)
  })
})
