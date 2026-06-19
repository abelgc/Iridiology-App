/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import {
  COMPARISON_REPORT_SECTION_KEYS,
  isComparisonReport,
} from '@/types/comparison-report'
import { comparisonReportContentSchema } from '@/lib/validators/comparison-report'

describe('comparison evolution schema', () => {
  it('has exactly the 7 evolution keys, none of them system-named', () => {
    expect(COMPARISON_REPORT_SECTION_KEYS).toHaveLength(7)
    expect(COMPARISON_REPORT_SECTION_KEYS[0]).toBe('comp_1_trajectory')
    COMPARISON_REPORT_SECTION_KEYS.forEach((k) => expect(k).not.toMatch(/^section_/))
  })

  it('validates a full 7-section object', () => {
    const valid: Record<string, string> = {}
    COMPARISON_REPORT_SECTION_KEYS.forEach((k) => (valid[k] = `Content for ${k}`))
    expect(comparisonReportContentSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a missing section and rejects empty values', () => {
    expect(comparisonReportContentSchema.safeParse({ comp_1_trajectory: 'x' }).success).toBe(false)
    const empties: Record<string, string> = {}
    COMPARISON_REPORT_SECTION_KEYS.forEach((k) => (empties[k] = ''))
    expect(comparisonReportContentSchema.safeParse(empties).success).toBe(false)
  })

  it('rejects the old 13-key standard shape', () => {
    const standard = { section_1_general_terrain: 'x', section_12_conclusion: 'y' }
    expect(comparisonReportContentSchema.safeParse(standard).success).toBe(false)
  })

  it('detects comparison vs standard reports by shape', () => {
    expect(isComparisonReport({ comp_1_trajectory: 'x' })).toBe(true)
    expect(isComparisonReport({ comp_1_major_changes: 'x' })).toBe(true)
    expect(isComparisonReport({ section_1_general_terrain: 'x' })).toBe(false)
  })
})
