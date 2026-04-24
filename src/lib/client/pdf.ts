import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ReportPdfDocument } from '@/components/client/report-pdf-document'
import type { ReportContent } from '@/types/report'

export async function generateReportPdf(report: ReportContent): Promise<Buffer> {
  const generatedAt = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const element = React.createElement(ReportPdfDocument, { report, generatedAt }) as any
  return await renderToBuffer(element)
}
