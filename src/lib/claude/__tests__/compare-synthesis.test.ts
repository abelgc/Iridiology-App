/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import { COMPARISON_SYNTHESIS_INSTRUCTIONS } from '../compare'

describe('COMPARISON_SYNTHESIS_INSTRUCTIONS', () => {
  it('forbids leaking Analysis A/B meta-commentary and prioritises change', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('must NEVER see references to "Analysis A"')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('offered no contradiction')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('what changed')
  })

  it('includes two-axis synthesis instruction', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('TWO-AXIS SYNTHESIS')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('structural axis')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('functional and burden axis')
  })

  it('includes system status labels in synthesis', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('SYSTEM STATUS LABELS')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('Structurally stable, functionally improving')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('Improving structurally and functionally')
  })

  it('includes language discipline in synthesis', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('LANGUAGE DISCIPLINE')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('no detectable shift')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('mild decompression')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('functional improvement despite persistent structural weakness')
  })
})
