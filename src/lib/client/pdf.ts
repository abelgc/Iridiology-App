import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ReportPdfDocument } from '@/components/client/report-pdf-document'
import type { ReportContent } from '@/types/report'
import type { Lang } from '@/lib/i18n'

export async function generateReportPdf(report: ReportContent, lang: Lang = 'en'): Promise<Buffer> {
  const generatedAt = new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : lang === 'es' ? 'es-ES' : 'en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const element = React.createElement(ReportPdfDocument, { report, generatedAt, lang }) as any
  return await renderToBuffer(element)
}
