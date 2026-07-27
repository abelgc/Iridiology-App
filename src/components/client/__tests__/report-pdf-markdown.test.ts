import { describe, it, expect } from 'vitest'
import { parseMarkdownBlocks } from '../report-pdf-document'

describe('parseMarkdownBlocks', () => {
  it('REGRESSION (2026-07-27): strips the ** markers instead of printing them at the client', () => {
    // Reported live: the emailed PDF showed literal "**Vitaminas**" because the whole
    // section body went into one <Text>. The web path runs it through ReactMarkdown;
    // the PDF had no equivalent.
    const blocks = parseMarkdownBlocks('Esto es **importante** para ti.')

    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[0].runs).toEqual([
      { text: 'Esto es ', bold: false },
      { text: 'importante', bold: true },
      { text: ' para ti.', bold: false },
    ])
    expect(blocks[0].runs.some((r) => r.text.includes('*'))).toBe(false)
  })

  it('REGRESSION (2026-07-27): turns "- " lines into bullets rather than leaving the dash in the text', () => {
    // This is exactly the shape consolidateRecommendationsForTier emits for section 14.
    const blocks = parseMarkdownBlocks(
      '**Vitaminas**\n- Vitamina C — Hígado\n- Complejo B — Sistema nervioso',
    )

    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'bullet', 'bullet'])
    expect(blocks[0].runs).toEqual([{ text: 'Vitaminas', bold: true }])
    expect(blocks[1].runs[0].text).toBe('Vitamina C — Hígado')
    expect(blocks[2].runs[0].text).toBe('Complejo B — Sistema nervioso')
  })

  it('treats a blank line as a paragraph break and joins soft-wrapped lines with a space', () => {
    const blocks = parseMarkdownBlocks('Primera linea\nsigue igual.\n\nSegundo parrafo.')

    expect(blocks).toHaveLength(2)
    expect(blocks[0].runs[0].text).toBe('Primera linea sigue igual.')
    expect(blocks[1].runs[0].text).toBe('Segundo parrafo.')
  })

  it('keeps bold inside a bullet, which is how the recommendations arrive', () => {
    const blocks = parseMarkdownBlocks('- **Hierro** — Sangre, Bazo')

    expect(blocks[0].type).toBe('bullet')
    expect(blocks[0].runs).toEqual([
      { text: 'Hierro', bold: true },
      { text: ' — Sangre, Bazo', bold: false },
    ])
  })

  it('accepts "* " bullets as well as "- ", since the model uses both', () => {
    const blocks = parseMarkdownBlocks('* Primero\n- Segundo')
    expect(blocks.map((b) => b.type)).toEqual(['bullet', 'bullet'])
  })

  it('returns nothing for an empty or whitespace-only body, so no blank block is drawn', () => {
    expect(parseMarkdownBlocks('')).toEqual([])
    expect(parseMarkdownBlocks('   \n\n  ')).toEqual([])
  })

  it('leaves a lone asterisk alone rather than swallowing the rest of the line', () => {
    // A single unmatched * must not be read as an unterminated bold run.
    const blocks = parseMarkdownBlocks('Peso 5 * 3 kilos')
    expect(blocks[0].runs).toEqual([{ text: 'Peso 5 * 3 kilos', bold: false }])
  })
})
