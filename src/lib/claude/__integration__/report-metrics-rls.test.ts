import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { recordReportMetrics } from '@/lib/claude/report-metrics'
import { testDb } from '@/test/integration-factories'

// REGRESSION (Supabase advisor 2026-09-26): report_metrics was created with RLS off, so the
// anon key shipped to every browser could read and rewrite analysis timing data.
function anonDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe('report_metrics access', () => {
  it('refuses an insert made with the public anon key', async () => {
    const { error } = await anonDb()
      .from('report_metrics')
      .insert({ session_id: randomUUID(), route: 'analyze', outcome: 'completed', total_ms: 1 })
    expect(error).not.toBeNull()
  })

  it('hides existing rows from the public anon key', async () => {
    const sessionId = randomUUID()
    await recordReportMetrics({ sessionId, route: 'analyze', outcome: 'completed', totalMs: 1234 })
    const { data } = await anonDb().from('report_metrics').select('*').eq('session_id', sessionId)
    expect(data ?? []).toHaveLength(0)
  })

  it('still records metrics through the server path', async () => {
    const sessionId = randomUUID()
    await recordReportMetrics({ sessionId, route: 'compare', outcome: 'failed', totalMs: 99 })
    const { data } = await testDb().from('report_metrics').select('total_ms').eq('session_id', sessionId)
    expect(data).toEqual([{ total_ms: 99 }])
  })
})
