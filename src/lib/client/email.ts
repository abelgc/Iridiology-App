import { Resend } from 'resend'
import type { Lang } from '@/types/client-analysis'

const SUBJECTS: Record<Lang, string> = {
  en: 'Your Iridology Analysis Report',
  es: 'Tu Informe de Análisis de Iridología',
  fr: 'Votre Rapport d\'Analyse d\'Iridologie',
}

const BODY_INTRO: Record<Lang, string> = {
  en: 'Your iridology report is ready. Click the link below to view or download it at any time:',
  es: 'Tu informe de iridología está listo. Pulsa el enlace de abajo para verlo o descargarlo en cualquier momento:',
  fr: 'Votre rapport d\'iridologie est ci-joint à cet e-mail.',
}

export async function sendReportEmail(params: {
  to: string
  lang: Lang
  reportToken: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const baseUrl = process.env.CLIENT_APP_BASE_URL

  if (!apiKey || !from || !baseUrl) {
    return { ok: false, error: 'email_not_configured' }
  }

  const url = `${baseUrl}/client/report/${params.reportToken}`
  const subject = SUBJECTS[params.lang]
  const intro = BODY_INTRO[params.lang]

  const html = `
    <p>${intro}</p>
    <p><a href="${url}">${url}</a></p>
  `

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
    })
    if (error) return { ok: false, error: String(error) }
    return { ok: true, id: data?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
