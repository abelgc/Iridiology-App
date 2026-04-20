import { describe, it, expect } from 'vitest'
import { generateReportToken, isValidReportToken } from '@/lib/client/report-token'

describe('report-token', () => {
  it('generates a UUID v4 string', () => {
    const token = generateReportToken()
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateReportToken()))
    expect(tokens.size).toBe(100)
  })

  it('isValidReportToken accepts a generated token', () => {
    expect(isValidReportToken(generateReportToken())).toBe(true)
  })

  it('isValidReportToken rejects garbage', () => {
    expect(isValidReportToken('not-a-uuid')).toBe(false)
    expect(isValidReportToken('')).toBe(false)
    expect(isValidReportToken('00000000-0000-0000-0000-000000000000')).toBe(false) // not v4
  })
})
