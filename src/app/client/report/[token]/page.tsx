'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { ClientReportViewer } from '@/components/client/client-report-viewer'
import { AnalysisSplash } from '@/components/client/analysis-splash'

function formatDeliveredAt(deliveredAt: string | null, lang: 'en' | 'es' | 'de'): string {
  if (!deliveredAt) return ''
  return new Date(deliveredAt).toLocaleDateString(lang === 'de' ? 'de-DE' : lang === 'es' ? 'es-ES' : 'en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export default function ClientReportPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const { t, setLang } = useLanguage()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'pending' }
    | { kind: 'ready'; report: Record<string, string>; language: 'en' | 'es' | 'de'; paymentTier: string; deliveredAt: string | null }
    | { kind: 'failed' }
    | { kind: 'error' }
  >({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    let elapsedMs = 0
    let delayMs = 3000 // starts at 3s, backs off up to 20s — same ~6min total wait budget as before
    const POLL_CEILING_MS = 360000
    const POLL_MAX_DELAY_MS = 20000
    async function load() {
      try {
        const res = await fetch(`/api/client/reports/${token}`)
        if (res.status === 409) {
          const body = (await res.json().catch(() => null)) as { status?: string } | null
          if (body?.status === 'failed') {
            if (!cancelled) setState({ kind: 'failed' })
            return
          }
          elapsedMs += delayMs
          if (elapsedMs >= POLL_CEILING_MS) {
            if (!cancelled) setState({ kind: 'failed' })
            return
          }
          if (!cancelled) setState({ kind: 'pending' })
          setTimeout(load, delayMs)
          delayMs = Math.min(delayMs * 1.3, POLL_MAX_DELAY_MS)
          return
        }
        if (!res.ok) {
          if (!cancelled) setState({ kind: 'error' })
          return
        }
        const json = (await res.json()) as {
          language: 'en' | 'es' | 'de'
          report: Record<string, string>
          paymentTier: string
          deliveredAt: string | null
        }
        if (!cancelled) {
          setLang(json.language)
          setState({
            kind: 'ready',
            report: json.report,
            language: json.language,
            paymentTier: json.paymentTier ?? '',
            deliveredAt: json.deliveredAt ?? null,
          })
        }
      } catch {
        if (!cancelled) setState({ kind: 'error' })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token, setLang])

  async function emailMe() {
    const res = await fetch(`/api/client/reports/${token}/email`, { method: 'POST' })
    alert(res.ok ? t('reportEmailSent') : t('error'))
  }

  if (state.kind === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#5d4f3f' }}>
      <p>{t('loading')}</p>
    </div>
  )
  if (state.kind === 'pending') return <AnalysisSplash />
  if (state.kind === 'failed') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#a85428', textAlign: 'center', padding: '0 24px' }}>
      <p>{t('analysisFailedMessage')}</p>
    </div>
  )
  if (state.kind === 'error') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#a85428' }}>
      <p>{t('error')}</p>
    </div>
  )

  const isPremium = state.paymentTier === 'premium_19_90'
  const formattedDate = formatDeliveredAt(state.deliveredAt, state.language)

  return (
    <main style={{ maxWidth: 1140, margin: '0 auto', padding: '32px 20px 80px' }}>
      {/* Page header */}
      <div className="no-print" style={{ marginBottom: 26 }}>
        <p className="report-tag">{t('reportTag')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 500,
              fontSize: 'clamp(32px, 5.5vw, 46px)',
              lineHeight: 1.05,
              letterSpacing: '-0.015em',
              color: '#2a3520',
              marginBottom: 8,
            }}>
              {t('reportTitle')}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', fontSize: 13, color: '#5d4f3f' }}>
              {formattedDate && (
                <>
                  <span>{t('reportMetaGenerated')} {formattedDate}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9c8272' }} />
                </>
              )}
              <span className="report-meta-pill">
                {isPremium ? t('reportPlanPremium') : t('reportPlanBasic')}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => window.print()} className="report-action-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              {t('reportPrint')}
            </button>
            <button onClick={emailMe} className="report-action-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              {t('reportEmail')}
            </button>
          </div>
        </div>
        <p style={{ color: '#5d4f3f', fontSize: 14.5, lineHeight: 1.6, marginTop: 18, maxWidth: 720 }}>
          {t('reportIntro')}
        </p>
      </div>

      {/* Report viewer */}
      <ClientReportViewer report={state.report} isPremium={isPremium} />

      {/* Footer */}
      <div className="report-footer no-print">
        <span>{t('reportFooter')}</span>
        <span>
          {t('reportFooterContact')}{' '}
          <a href={`mailto:${t('reportFooterEmail')}`} className="report-footer-link">
            {t('reportFooterEmail')}
          </a>
        </span>
      </div>
    </main>
  )
}
