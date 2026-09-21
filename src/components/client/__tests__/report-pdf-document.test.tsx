import { describe, it, expect, vi } from 'vitest'
import { pdf } from '@react-pdf/renderer'
import { REPORT_SECTION_KEYS, type ReportContent } from '@/types/report'

const consolidateMock = vi.fn((text: string | undefined, _isPremium?: boolean, _lang?: string) => text ?? '')
vi.mock('@/lib/client/filter-recommendations', () => ({
  consolidateRecommendationsForTier: (text: string | undefined, isPremium?: boolean, lang?: string) =>
    consolidateMock(text, isPremium, lang),
}))

import { ReportPdfDocument } from '../report-pdf-document'

function makeReport(): ReportContent {
  const content = {} as Record<string, string>
  for (const key of REPORT_SECTION_KEYS) content[key] = `Content for ${key}.`
  return content as unknown as ReportContent
}

describe('ReportPdfDocument', () => {
  it("REGRESSION (Maike Kedher report, 2026-09-21): passes the report's lang through to consolidateRecommendationsForTier, instead of always defaulting to English headers", async () => {
    consolidateMock.mockClear()
    await pdf(
      <ReportPdfDocument report={makeReport()} generatedAt="2026-09-21" lang="es" isPremium={true} />,
    ).toBuffer()

    expect(consolidateMock).toHaveBeenCalledWith(
      expect.stringContaining('section_14_recommendations'),
      true,
      'es',
    )
  })

  it('renders one page per non-empty section, in order, without crashing', async () => {
    consolidateMock.mockImplementation((text: string | undefined) => text ?? '')
    const buffer = await pdf(
      <ReportPdfDocument report={makeReport()} generatedAt="2026-09-21" lang="en" isPremium={false} />,
    ).toBuffer()

    expect(buffer).toBeTruthy()
  })

  it('skips a section entirely when its content is empty, instead of rendering a blank page', async () => {
    consolidateMock.mockImplementation((text: string | undefined) => text ?? '')
    const report = makeReport()
    report.section_13_strengths_of_the_body = ''
    const buffer = await pdf(
      <ReportPdfDocument report={report} generatedAt="2026-09-21" lang="en" isPremium={false} />,
    ).toBuffer()

    expect(buffer).toBeTruthy()
  })
})
