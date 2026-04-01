'use client'

import React, { useState } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReportSection } from './report-section'
import { REPORT_SECTION_KEYS, type ReportSectionKey, type ReportContent } from '@/types/report'
import type { Report, ReportCorrection } from '@/types/database'
import Link from 'next/link'

interface ReportViewerProps {
  report: Report
  corrections?: ReportCorrection[]
}

export function ReportViewer({ report, corrections = [] }: ReportViewerProps) {
  const [translatedContent, setTranslatedContent] = useState<Partial<ReportContent> | null>(null)
  const [lang, setLang] = useState<'en' | 'es'>('en')
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)

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

  const handleToggleLang = async () => {
    if (lang === 'en') {
      if (!translatedContent) {
        setIsTranslating(true)
        setTranslateError(null)
        try {
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId: report.id }),
          })
          if (!res.ok) throw new Error('Translation failed')
          const data = await res.json()
          setTranslatedContent(data.content)
        } catch (err) {
          setTranslateError(err instanceof Error ? err.message : 'Translation failed')
          return
        } finally {
          setIsTranslating(false)
        }
      }
      setLang('es')
    } else {
      setLang('en')
    }
  }

  const displayContent = lang === 'es' && translatedContent
    ? { ...report.report_content, ...translatedContent }
    : report.report_content

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="flex gap-2 mb-6 no-print items-center flex-wrap print:hidden">
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
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={lang === 'es' ? handleToggleLang : undefined}
            disabled={isTranslating}
            className={`px-3 py-1.5 text-xs font-semibold rounded-l-md border transition-colors ${
              lang === 'en'
                ? 'bg-[oklch(0.68_0.12_65)] text-[oklch(0.22_0.04_50)] border-[oklch(0.68_0.12_65)]'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            EN
          </button>
          <button
            onClick={lang === 'en' ? handleToggleLang : undefined}
            disabled={isTranslating}
            className={`px-3 py-1.5 text-xs font-semibold rounded-r-md border-t border-b border-r transition-colors ${
              lang === 'es'
                ? 'bg-[oklch(0.68_0.12_65)] text-[oklch(0.22_0.04_50)] border-[oklch(0.68_0.12_65)]'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'ES'}
          </button>
        </div>
      </div>

      {translateError && (
        <p className="text-sm text-red-600 no-print">{translateError}</p>
      )}

      <div className="space-y-2">
        {REPORT_SECTION_KEYS.map((sectionKey) => (
          <ReportSection
            key={sectionKey}
            sectionKey={sectionKey}
            content={displayContent[sectionKey] ?? ''}
            correctionCount={correctionsBySection[sectionKey] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
