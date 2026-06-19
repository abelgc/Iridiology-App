/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import { COMPARISON_SYNTHESIS_INSTRUCTIONS } from '../compare'

describe('COMPARISON_SYNTHESIS_INSTRUCTIONS', () => {
  it('forbids leaking Analysis A/B meta-commentary', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('Never reference "Analysis A"')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('Produce one clean integrated progress review only')
  })

  it('keeps the report a progress review with 2 comparison keys', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('progress review')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('2 keys')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('comp_1_improvements')
  })

  it('classifies mobilization as improvement', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('MOBILIZATION')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('peripheral expression')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('scleral activation')
  })

  it('bans image-number references', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('IMAGE REFERENCE')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('previous right eye')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('current right eye')
  })
})
