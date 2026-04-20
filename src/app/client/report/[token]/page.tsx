'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { ClientReportViewer } from '@/components/client/client-report-viewer'

export default function ClientReportPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const { t, setLang } = useLanguage()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'pending' }
    | { kind: 'ready'; report: Record<string, string>; language: 'en' | 'es' }
    | { kind: 'error' }
  >({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/client/reports/${token}`)
        if (res.status === 409) {
          if (!cancelled) setState({ kind: 'pending' })
          setTimeout(load, 3000)
          return
        }
        if (!res.ok) {
          if (!cancelled) setState({ kind: 'error' })
          return
        }
        const json = (await res.json()) as { language: 'en' | 'es'; report: Record<string, string> }
        if (!cancelled) {
          setLang(json.language)
          setState({ kind: 'ready', report: json.report, language: json.language })
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

  if (state.kind === 'loading') return <p>{t('loading')}</p>
  if (state.kind === 'pending') return <p>{t('uploadAnalyzing')}</p>
  if (state.kind === 'error') return <p>{t('error')}</p>

  return (
    <section>
      <header className="flex flex-wrap gap-2 justify-between items-center mb-6 print:hidden">
        <h2 className="text-2xl font-semibold">{t('reportReady')}</h2>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="border rounded px-3 py-1">
            {t('reportPrint')}
          </button>
          <button onClick={emailMe} className="border rounded px-3 py-1">
            {t('reportEmail')}
          </button>
        </div>
      </header>
      <ClientReportViewer report={state.report} />
    </section>
  )
}
