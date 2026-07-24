import { describe, it, expect } from 'vitest'
import { reportContentSchema } from '../report'
import { parseReportResponse } from '@/lib/claude/parse'
import { REPORT_SECTION_KEYS, PRACTITIONER_ONLY_SECTION_KEYS } from '@/types/report'

function fullReport(): Record<string, string> {
  const report: Record<string, string> = {}
  ;[...REPORT_SECTION_KEYS, ...PRACTITIONER_ONLY_SECTION_KEYS].forEach((key) => {
    report[key] = `Content for ${key}`
  })
  return report
}

describe('reportContentSchema', () => {
  it('requires and preserves section_15_iris_sign_patterns', () => {
    const report = fullReport()
    const result = reportContentSchema.parse(report)
    expect(result.section_15_iris_sign_patterns).toBe('Content for section_15_iris_sign_patterns')
  })

  it('rejects a report where section_15_iris_sign_patterns is empty', () => {
    const report = fullReport()
    report.section_15_iris_sign_patterns = ''
    const result = reportContentSchema.safeParse(report)
    expect(result.success).toBe(false)
  })
})

describe('parseReportResponse', () => {
  it('round-trips a valid 15-key JSON response', () => {
    const report = fullReport()
    const result = parseReportResponse(JSON.stringify(report))
    expect('code' in result).toBe(false)
    if (!('code' in result)) {
      expect(result.section_15_iris_sign_patterns).toBe('Content for section_15_iris_sign_patterns')
    }
  })

  it('fails validation when section_15_iris_sign_patterns is missing', () => {
    const report = fullReport()
    delete (report as Record<string, string | undefined>).section_15_iris_sign_patterns
    const result = parseReportResponse(JSON.stringify(report))
    expect('code' in result).toBe(true)
  })
})
