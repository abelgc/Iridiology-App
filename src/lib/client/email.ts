import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import type { Lang } from '@/types/client-analysis'

const SUBJECTS: Record<Lang, string> = {
  en: 'Your Iridology Analysis Report',
  es: 'Tu Informe de Análisis de Iridología',
  de: 'Ihr Iridologie-Analysebericht',
}

const BODY_INTRO: Record<Lang, string> = {
  en: 'Your iridology report is attached to this email as a PDF. You own this file and can save it at any time.',
  es: 'Tu informe de iridología está adjunto a este correo como PDF. Este archivo es tuyo y puedes guardarlo cuando quieras.',
  de: 'Ihr Iridologie-Bericht ist dieser E-Mail als PDF beigefügt. Diese Datei gehört Ihnen und kann jederzeit gespeichert werden.',
}

const THANK_YOU_TEXT: Record<Lang, string> = {
  en: 'Thank you for your purchase.',
  es: 'Gracias por tu compra.',
  de: 'Vielen Dank für Ihren Kauf.',
}

/**
 * Resend returns an error OBJECT, and `String(err)` on one yields literally
 * "[object Object]" — which is exactly what was written to the logs while report email
 * delivery failed for 21 straight days, leaving the outage undiagnosable even with the
 * full log history. Pull out the fields worth reading, and fall back to JSON rather than
 * to a shape that carries no information at all.
 */
function describeSendError(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as { name?: string; message?: string; statusCode?: number }
    const parts = [
      e.statusCode !== undefined ? `${e.statusCode}` : null,
      e.name ?? null,
      e.message ?? null,
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(' ')
    try {
      return JSON.stringify(err)
    } catch {
      return 'unserialisable_error'
    }
  }
  return String(err)
}

export async function sendReportEmail(params: {
  to: string
  lang: Lang
  analysisId: string
  paymentTier: string
  pdfBuffer: Buffer
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    return { ok: false, error: 'email_not_configured' }
  }

  const supabase = createAdminClient()

  // Claim before sending, not after: the previous check-then-act pattern checked for an
  // existing log row, then sent via Resend, then wrote the log — so two concurrent calls
  // (a double-click on "Email me", or the automatic post-analysis send racing a manual
  // resend) could both pass the check and both actually send. Claiming a 'pending' row
  // first, guarded by the UNIQUE(analysis_id) constraint, means only one caller proceeds.
  const { data: inserted } = await supabase
    .from('email_send_log')
    .insert({
      analysis_id: params.analysisId,
      recipient_email: params.to,
      payment_tier: params.paymentTier,
      status: 'pending',
    })
    .select('id')
    .single()

  let claimId: string
  if (inserted) {
    claimId = inserted.id
  } else {
    // A row already exists for this analysis — only re-claim a previously FAILED attempt.
    const { data: existing, error: lookupError } = await supabase
      .from('email_send_log')
      .select('id, status')
      .eq('analysis_id', params.analysisId)
      .single()

    // Not knowing is not the same as having sent it. The old code collapsed both into
    // ok:true, so a Supabase outage surfaced to the client as "Report sent to your email"
    // for an email that was never attempted. Report the uncertainty instead — the caller
    // turns a non-ok result into a visible failure, which is the honest thing to show.
    if (lookupError || !existing) {
      return { ok: false, error: 'send_state_unknown' }
    }

    // 'pending' is the only status that must block: another invocation holds the claim
    // right now — the automatic post-analysis send racing a manual resend, or a
    // double-click. That race is the whole reason the claim exists.
    if (existing.status === 'pending') {
      return { ok: false, error: 'send_in_progress' }
    }

    // 'sent' or 'failed' — either way this is a fresh, deliberate request, so honour it.
    // Refusing to re-send from 'sent' turned the client's "email me my report" button
    // into a no-op that still reported success: reported live on 2026-07-27, the client
    // pressed it after the automatic email and nothing ever arrived. Delivering a second
    // copy of a report someone explicitly asked for again is the correct outcome; the
    // dedup exists to stop concurrent sends, not to cap a client at one copy for life.
    const { data: reclaimed } = await supabase
      .from('email_send_log')
      .update({ status: 'pending' })
      .eq('id', existing.id)
      .eq('status', existing.status) // CAS on exactly the status we just read
      .select('id')
      .single()

    if (!reclaimed) {
      // Someone else won the re-claim between our read and this write. Backing off is
      // right — but they are still sending, so this is 'in progress', not 'delivered'.
      return { ok: false, error: 'send_in_progress' }
    }
    claimId = reclaimed.id
  }

  const subject = SUBJECTS[params.lang]
  const intro = BODY_INTRO[params.lang]
  const thankYou = THANK_YOU_TEXT[params.lang]

  // Bug fix: Email should contain only the PDF attachment, no URL link
  // The PDF is the deliverable; no need for a backup URL
  const html = `
    <p>${intro}</p>
    <p>${thankYou}</p>
  `

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
      attachments: [
        {
          filename: 'iridology-report.pdf',
          content: params.pdfBuffer,
        },
      ],
    })

    const reason = error ? describeSendError(error) : null
    await supabase
      .from('email_send_log')
      .update({ status: error ? 'failed' : 'sent', error_message: reason })
      .eq('id', claimId)

    if (error) return { ok: false, error: reason ?? 'unknown' }
    return { ok: true, id: data?.id }
  } catch (err) {
    const reason = describeSendError(err)
    try {
      await supabase
        .from('email_send_log')
        .update({ status: 'failed', error_message: reason })
        .eq('id', claimId)
    } catch {
      // best-effort log — ignore failures
    }

    return { ok: false, error: reason }
  }
}
