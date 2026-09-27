import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { recordReportMetrics } from '@/lib/claude/report-metrics'

// REGRESSION (2026-09-27): supabase-js reports a failed insert in the returned `error`
// instead of throwing, so the catch block never saw it and lost metrics vanished silently.
describe('recordReportMetrics when the database rejects the row', () => {
  it('logs the rejection instead of losing it, and still does not throw', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // NaN serializes to null, which violates total_ms NOT NULL.
      await expect(
        recordReportMetrics({ sessionId: randomUUID(), route: 'analyze', outcome: 'completed', totalMs: Number.NaN }),
      ).resolves.toBeUndefined()
      expect(log).toHaveBeenCalledWith(
        '[recordReportMetrics] failed to record metrics (non-fatal):',
        expect.objectContaining({ code: '23502' }),
      )
    } finally {
      log.mockRestore()
    }
  })
})
