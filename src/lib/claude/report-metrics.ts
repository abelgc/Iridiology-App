import { createAdminClient } from '@/lib/supabase/server'

export interface ReportMetricsInput {
  sessionId: string
  route: 'analyze' | 'compare'
  outcome: 'completed' | 'failed'
  totalMs: number
  claudeLegMs?: number
  claudeLegRetried?: boolean
  openaiLegMs?: number
  openaiLegRetried?: boolean
  synthesisMs?: number
  synthesisRetried?: boolean
}

/**
 * Fire-and-forget metrics insert — never throws, never blocks or delays the actual analysis.
 * Observability must not become a new failure mode. If this insert fails, the caller's report
 * generation must proceed exactly as if this function had never been called.
 */
export async function recordReportMetrics(input: ReportMetricsInput): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('report_metrics').insert({
      session_id: input.sessionId,
      route: input.route,
      outcome: input.outcome,
      total_ms: input.totalMs,
      claude_leg_ms: input.claudeLegMs ?? null,
      claude_leg_retried: input.claudeLegRetried ?? false,
      openai_leg_ms: input.openaiLegMs ?? null,
      openai_leg_retried: input.openaiLegRetried ?? false,
      synthesis_ms: input.synthesisMs ?? null,
      synthesis_retried: input.synthesisRetried ?? false,
    })
  } catch (error) {
    console.error('[recordReportMetrics] failed to record metrics (non-fatal):', error)
  }
}
