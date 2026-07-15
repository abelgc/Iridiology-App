'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { REPORT_SECTION_KEYS, REPORT_SECTION_I18N_KEYS } from '@/types/report'
import { useLanguage } from '@/lib/i18n-context'
import type { TranslationKey } from '@/lib/i18n'
import { consolidateRecommendationsForTier } from '@/lib/client/filter-recommendations'

export function ClientReportViewer({
  report,
  isPremium,
}: {
  report: Partial<Record<string, string>>
  isPremium: boolean
}) {
  const { t } = useLanguage()
  const sectionsWithContent = REPORT_SECTION_KEYS.filter((key) => !!report[key])
  const [activeKey, setActiveKey] = useState<string>(sectionsWithContent[0] ?? '')

  function scrollToSection(key: string) {
    setActiveKey(key)
    const el = document.getElementById(`report-section-${key}`)
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 90
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  return (
    <div className="report-layout">
      {/* TOC sidebar */}
      <aside className="no-print" style={{ position: 'relative' }}>
        <nav className="report-toc">
          <p className="report-toc-title">{t('reportTocTitle')}</p>
          <ul className="report-toc-list">
            {sectionsWithContent.map((key, idx) => {
              const numStr = String(idx + 1).padStart(2, '0')
              const label = t(REPORT_SECTION_I18N_KEYS[key] as TranslationKey)
              return (
                <li key={key}>
                  <button
                    onClick={() => scrollToSection(key)}
                    className={`report-toc-btn${activeKey === key ? ' active' : ''}`}
                  >
                    <span className="report-toc-num">{numStr}</span>
                    {label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      {/* Report card */}
      <div className="report-card">
        <article className="report-prose">
          {sectionsWithContent.map((key, idx) => {
            const numStr = String(idx + 1).padStart(2, '0')
            const label = t(REPORT_SECTION_I18N_KEYS[key] as TranslationKey)
            const content =
              key === 'section_14_recommendations'
                ? consolidateRecommendationsForTier(report[key], isPremium)
                : report[key]!
            return (
              <section key={key} id={`report-section-${key}`}>
                <h2>
                  <span className="report-section-num">{numStr}</span>
                  {label}
                </h2>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </section>
            )
          })}
        </article>

        {/* Disclaimer */}
        <div className="report-disclaimer">
          <span className="report-disclaimer-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </span>
          <p style={{ fontSize: 12, color: '#5d4f3f', lineHeight: 1.55, fontStyle: 'italic', marginBottom: 0 }}>
            {t('reportDisclaimerText')}
          </p>
        </div>
      </div>
    </div>
  )
}
