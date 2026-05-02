'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { REPORT_SECTION_KEYS, REPORT_SECTION_I18N_KEYS } from '@/types/report'
import { useLanguage } from '@/lib/i18n-context'
import type { TranslationKey } from '@/lib/i18n'

export function ClientReportViewer({
  report,
}: {
  report: Partial<Record<string, string>>
}) {
  const { t } = useLanguage()
  return (
    <article className="prose max-w-none print:prose-sm">
      {REPORT_SECTION_KEYS.map((key) => {
        const content = report[key]
        if (!content) return null
        return (
          <section key={key} className="mb-8">
            <h2>{t(REPORT_SECTION_I18N_KEYS[key] as TranslationKey)}</h2>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </section>
        )
      })}
    </article>
  )
}
