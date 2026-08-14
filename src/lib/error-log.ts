import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'

export type ErrorSource = 'server' | 'edge' | 'client'

export type LogAppErrorParams = {
  source: ErrorSource
  route: string | null
  message: string
  stack?: string | null
  context?: unknown
  severity?: string
}

// Same reasoning as NEW_DAMAGE_WINDOW_MS in the health route: bound the alert to recent
// damage, or a burst of identical errors pages a human once and then trains them to ignore
// the mailbox for the rest of the hour it keeps recurring.
const ALERT_DEDUP_WINDOW_MS = 60 * 60 * 1000

function excerpt(message: string, max = 120): string {
  return message.length > max ? `${message.slice(0, max)}…` : message
}

/**
 * Insert one row into app_errors and, if this is the first occurrence of this
 * route+message pair in the last hour, send one alert email. Never throws — a logging
 * failure must not break the request (server/edge) or the beacon (client) that triggered
 * it, so every failure mode here ends in a console.error, not a rejected promise.
 */
export async function logAppError(params: LogAppErrorParams): Promise<void> {
  try {
    const supabase = createAdminClient()
    const route = params.route ?? null
    const message = params.message
    const windowStart = new Date(Date.now() - ALERT_DEDUP_WINDOW_MS).toISOString()

    // Dedup check BEFORE inserting, so the row we're about to write never counts against
    // itself.
    let dedupQuery = supabase
      .from('app_errors')
      .select('*', { count: 'exact', head: true })
      .eq('message', message)
      .gte('created_at', windowStart)
    dedupQuery = route === null ? dedupQuery.is('route', null) : dedupQuery.eq('route', route)

    const { count, error: countError } = await dedupQuery
    if (countError) {
      console.error('logAppError: dedup check failed', countError)
    }
    const isFirstOccurrence = (count ?? 0) === 0

    const { error: insertError } = await supabase.from('app_errors').insert({
      source: params.source,
      route,
      message,
      stack: params.stack ?? null,
      context: params.context ?? null,
      severity: params.severity ?? 'error',
    })

    if (insertError) {
      console.error('logAppError: insert failed', insertError)
      return
    }

    if (isFirstOccurrence) {
      await alertAppError({ route, message })
    }
  } catch (err) {
    console.error('logAppError: failed to log error', err)
  }
}

/** Reuses the Resend account already wired up in src/lib/client/email.ts and the health
 * check — HEALTH_ALERT_EMAIL is already provisioned for exactly this kind of alert. */
async function alertAppError(params: { route: string | null; message: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const to = process.env.HEALTH_ALERT_EMAIL

  if (!apiKey || !from || !to) {
    console.error('app error occurred but alerting is not configured:', params)
    return
  }

  try {
    const resend = new Resend(apiKey)
    const routeLabel = params.route ?? 'unknown route'
    await resend.emails.send({
      from,
      to,
      subject: `[Error] ${routeLabel}: ${excerpt(params.message)}`,
      html: `<p><strong>Route:</strong> ${routeLabel}</p><p><strong>Message:</strong> ${params.message}</p>`,
    })
  } catch (err) {
    console.error('app error alert email failed to send:', err)
  }
}
