/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import { COMPARISON_SYNTHESIS_INSTRUCTIONS } from '../compare'

describe('COMPARISON_SYNTHESIS_INSTRUCTIONS', () => {
  it('forbids leaking Analysis A/B meta-commentary and prioritises change', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('must NEVER see references to "Analysis A"')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('offered no contradiction')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('lead with what changed')
  })

  it('keeps the report an evolution report with the 7 comparison keys', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('EVOLUTION STRUCTURE')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('evolution report, not a system report')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('7 comparison keys')
  })

  it('keeps the two-axis instruction and language discipline', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('TWO AXES')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('functional and burden axis')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('LANGUAGE DISCIPLINE')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('mild decompression')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('functional improvement despite persistent structural weakness')
  })
})
