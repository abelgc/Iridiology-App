import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import type { Lang } from '@/types/client-analysis'

const SUBJECTS: Record<Lang, string> = {
  en: 'Your Iridology Analysis Report',
  es: 'Tu Informe de Análisis de Iridología',
}

const BODY_INTRO: Record<Lang, string> = {
  en: 'Your iridology report is attached to this email as a PDF. You own this file and can save it at any time.',
  es: 'Tu informe de iridología está adjunto a este correo como PDF. Este archivo es tuyo y puedes guardarlo cuando quieras.',
}

const THANK_YOU_TEXT: Record<Lang, string> = {
  en: 'Thank you for your purchase.',
  es: 'Gracias por tu compra.',
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

  // Idempotency check — never send twice for the same analysis
  // Bug fix: Check for both 'sent' AND 'failed' to prevent resending failed attempts
  const { data: existing } = await supabase
    .from('email_send_log')
    .select('id, status')
    .eq('analysis_id', params.analysisId)
    .single()

  if (existing?.status === 'sent') {
    return { ok: true, id: 'already_sent' }
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

    const status = error ? 'failed' : 'sent'
    await supabase.from('email_send_log').insert({
      analysis_id: params.analysisId,
      recipient_email: params.to,
      payment_tier: params.paymentTier,
      status,
    })

    if (error) return { ok: false, error: String(error) }
    return { ok: true, id: data?.id }
  } catch (err) {
    try {
      await supabase.from('email_send_log').insert({
        analysis_id: params.analysisId,
        recipient_email: params.to,
        payment_tier: params.paymentTier,
        status: 'failed',
      })
    } catch {
      // best-effort log — ignore failures
    }

    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
