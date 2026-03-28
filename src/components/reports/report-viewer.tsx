'use client'

import React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReportSection } from './report-section'
import { REPORT_SECTION_KEYS, type ReportSectionKey } from '@/types/report'
import type { Report, ReportCorrection } from '@/types/database'
import Link from 'next/link'

interface ReportViewerProps {
  report: Report
  corrections?: ReportCorrection[]
}

export function ReportViewer({ report, corrections = [] }: ReportViewerProps) {
  const correctionsBySection = corrections.reduce(
    (acc, correction) => {
      const key = correction.section_key as ReportSectionKey
      if (!acc[key]) {
        acc[key] = 0
      }
      acc[key]++
      return acc
    },
    {} as Record<ReportSectionKey, number>,
  )

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-6 no-print">
        <Link href={`/reports/${report.id}/edit`}>
          <Button variant="default">Edit Report</Button>
        </Link>
        <Link href={`/reports/${report.id}/chat`}>
          <Button variant="outline">Chat</Button>
        </Link>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" />
          Print
        </Button>
      </div>

      <div className="space-y-2">
        {REPORT_SECTION_KEYS.map((sectionKey) => (
          <ReportSection
            key={sectionKey}
            sectionKey={sectionKey}
            content={report.report_content[sectionKey]}
            correctionCount={correctionsBySection[sectionKey] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
