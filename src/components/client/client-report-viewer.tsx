'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { REPORT_SECTION_KEYS, REPORT_SECTION_LABELS } from '@/types/report'

export function ClientReportViewer({
  report,
}: {
  report: Partial<Record<string, string>>
}) {
  return (
    <article className="prose max-w-none print:prose-sm">
      {REPORT_SECTION_KEYS.map((key) => {
        const content = report[key]
        if (!content) return null
        return (
          <section key={key} className="mb-8">
            <h2>{REPORT_SECTION_LABELS[key]}</h2>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </section>
        )
      })}
    </article>
  )
}
