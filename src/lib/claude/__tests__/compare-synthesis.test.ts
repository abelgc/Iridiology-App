/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import { COMPARISON_SYNTHESIS_INSTRUCTIONS } from '../compare'

describe('COMPARISON_SYNTHESIS_INSTRUCTIONS', () => {
  it('forbids leaking Analysis A/B meta-commentary and prioritises change', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('must NEVER see references to "Analysis A"')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('offered no contradiction')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('what changed')
  })
})
