'use client'

import React, { useState } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReportSection } from './report-section'
import { getOrderedSectionKeys, type ReportContent } from '@/types/report'
import type { Report, ReportCorrection } from '@/types/database'
import Link from 'next/link'

interface ReportViewerProps {
  report: Report
  corrections?: ReportCorrection[]
}

const UK_FLAG = (
  <svg viewBox="0 0 18 14" preserveAspectRatio="none" width="18" height="14" style={{ borderRadius: '2px', flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
    <rect width="18" height="14" fill="#012169" />
    <path d="M0,0 L18,14 M18,0 L0,14" stroke="white" strokeWidth="2.5" />
    <path d="M0,0 L18,14 M18,0 L0,14" stroke="#C8102E" strokeWidth="1.2" />
    <path d="M9,0 V14 M0,7 H18" stroke="white" strokeWidth="3" />
    <path d="M9,0 V14 M0,7 H18" stroke="#C8102E" strokeWidth="1.6" />
  </svg>
)

const ES_FLAG = (
  <svg viewBox="0 0 18 14" preserveAspectRatio="none" width="18" height="14" style={{ borderRadius: '2px', flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
    <rect width="18" height="3.5" fill="#aa151b" />
    <rect y="3.5" width="18" height="7" fill="#f1bf00" />
    <rect y="10.5" width="18" height="3.5" fill="#aa151b" />
  </svg>
)

export function ReportViewer({ report, corrections = [] }: ReportViewerProps) {
  const [localContent, setLocalContent] = useState<ReportContent>(report.report_content)
  const [translatedContent, setTranslatedContent] = useState<Partial<ReportContent> | null>(null)
  const [lang, setLang] = useState<'en' | 'es'>('en')
  const [isTranslating, setIsTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)

  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editingText, setEditingText] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const correctionsBySection = corrections.reduce(
    (acc, correction) => {
      const key = correction.section_key
      if (!acc[key]) acc[key] = 0
      acc[key]++
      return acc
    },
    {} as Record<string, number>,
  )

  const handlePrint = () => window.print()

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

  const handleEditSection = (key: string) => {
    setEditingSection(key)
    setEditingText(displayContent[key] ?? '')
    setSaveError(null)
  }

  const handleCancelEdit = () => {
    setEditingSection(null)
    setEditingText('')
    setSaveError(null)
  }

  const handleSaveSection = async () => {
    if (!editingSection) return
    setIsSaving(true)
    setSaveError(null)
    const newContent = { ...localContent, [editingSection]: editingText }
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_content: newContent }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setLocalContent(newContent)
      // Invalidate translation cache since content changed
      setTranslatedContent(null)
      setEditingSection(null)
      setEditingText('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const displayContent = lang === 'es' && translatedContent
    ? { ...localContent, ...translatedContent }
    : localContent

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="flex gap-2 mb-6 no-print items-center flex-wrap print:hidden">
        <Link href={`/practitioner/reports/${report.id}/edit`}>
          <Button variant="default">Edit Report</Button>
        </Link>
        <Link href={`/practitioner/reports/${report.id}/chat`}>
          <Button variant="outline">Chat</Button>
        </Link>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" />
          Print
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={lang === 'es' ? handleToggleLang : undefined}
            disabled={isTranslating || !!editingSection}
            className={`px-4 py-2.5 text-sm font-semibold rounded-l-md border transition-colors min-h-[44px] flex items-center justify-center gap-2 ${
              lang === 'en'
                ? 'bg-[oklch(0.68_0.12_65)] text-[oklch(0.22_0.04_50)] border-[oklch(0.68_0.12_65)]'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {UK_FLAG}EN
          </button>
          <button
            onClick={lang === 'en' ? handleToggleLang : undefined}
            disabled={isTranslating || !!editingSection}
            className={`px-4 py-2.5 text-sm font-semibold rounded-r-md border-t border-b border-r transition-colors min-h-[44px] flex items-center justify-center gap-2 ${
              lang === 'es'
                ? 'bg-[oklch(0.68_0.12_65)] text-[oklch(0.22_0.04_50)] border-[oklch(0.68_0.12_65)]'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {ES_FLAG}{isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'ES'}
          </button>
        </div>
      </div>

      {translateError && (
        <p className="text-sm text-red-600 no-print">{translateError}</p>
      )}

      <div className="space-y-2">
        {getOrderedSectionKeys(localContent).map((sectionKey) => (
          <ReportSection
            key={sectionKey}
            sectionKey={sectionKey}
            content={displayContent[sectionKey] ?? ''}
            isEditing={editingSection === sectionKey}
            editingContent={editingSection === sectionKey ? editingText : undefined}
            onEdit={!editingSection ? () => handleEditSection(sectionKey) : undefined}
            onContentChange={setEditingText}
            onSave={handleSaveSection}
            onCancel={handleCancelEdit}
            isSaving={isSaving}
            saveError={editingSection === sectionKey ? saveError : null}
            correctionCount={correctionsBySection[sectionKey] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
