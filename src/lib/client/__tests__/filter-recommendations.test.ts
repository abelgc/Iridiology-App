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

  describe('REGRESSION (Maike Kedher report, 2026-09-21): section_14_recommendations can now arrive with localized prefixes', () => {
    const SPANISH_TWO_ORGAN_TEXT = `**Hígado**
Vitaminas: A, B12
Minerales: Hierro
Hierbas: Diente de león

**Riñones**
Vitaminas: A, B12
Minerales: Hierro
Hierbas: Alfalfa`

    it('parses Spanish-prefixed input and dedupes shared items across organs, instead of silently falling back to raw unfiltered text', () => {
      const result = consolidateRecommendationsForTier(SPANISH_TWO_ORGAN_TEXT, true, 'es')
      expect(result).not.toBe(SPANISH_TWO_ORGAN_TEXT)
      const sections = parseSections(result)
      expect(sections['Vitaminas']['A']).toEqual(['Hígado', 'Riñones'])
    })

    it('renders section headers localized to the requested lang, not hardcoded English', () => {
      const result = consolidateRecommendationsForTier(SPANISH_TWO_ORGAN_TEXT, true, 'es')
      expect(result).toContain('**Vitaminas**')
      expect(result).not.toContain('**Vitamins**')
    })

    it('still strips minerals/herbs for the non-premium tier when the input is Spanish-prefixed', () => {
      const result = consolidateRecommendationsForTier(SPANISH_TWO_ORGAN_TEXT, false, 'es')
      expect(result).not.toContain('Minerales')
      expect(result).not.toContain('Hierbas')
      expect(result).toContain('Vitaminas')
    })

    it('still handles English input unchanged when lang is omitted (back-compat)', () => {
      const result = consolidateRecommendationsForTier(TWO_ORGAN_TEXT, true)
      const sections = parseSections(result)
      expect(sections.Vitamins['A']).toEqual(['Liver', 'Kidneys'])
    })
  })
})
