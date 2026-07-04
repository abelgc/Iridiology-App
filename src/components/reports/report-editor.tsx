'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/shared/markdown-renderer'
import { getOrderedSectionKeys, getSectionLabel, REPORT_SECTION_I18N_KEYS, type ReportContent } from '@/types/report'
import { t, detectLocale, type TranslationKey } from '@/lib/i18n'
import type { Report } from '@/types/database'

interface ReportEditorProps {
  report: Report
  onSave: (content: ReportContent) => Promise<void>
}

export function ReportEditor({ report, onSave }: ReportEditorProps) {
  const [content, setContent] = useState<ReportContent>(report.report_content)
  const [isLoading, setIsLoading] = useState(false)
  const [editingSection, setEditingSection] = useState<string | null>(
    getOrderedSectionKeys(report.report_content)[0] ?? null,
  )
  // No report-level language field exists yet, so fall back to the
  // practitioner's browser locale (same detection used by the client-facing
  // LanguageProvider) rather than hardcoding English.
  const [lang] = useState(() => detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined))

  const getLabel = (key: string) => {
    const i18nKey = REPORT_SECTION_I18N_KEYS[key as keyof typeof REPORT_SECTION_I18N_KEYS] as TranslationKey | undefined
    return i18nKey ? t(lang, i18nKey) : getSectionLabel(key)
  }

  const currentSection = editingSection
  const currentContent = currentSection ? content[currentSection] : ''

  const handleSectionChange = (value: string) => {
    if (currentSection) {
      setContent({
        ...content,
        [currentSection]: value,
      })
    }
  }

  const handleSave = async () => {
    setIsLoading(true)
    try {
      await onSave(content)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-6">
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save All'}
        </Button>
        <Button variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section selector */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Sections</h2>
          <div className="space-y-2 border rounded-lg p-4 bg-gray-50 dark:bg-gray-900 max-h-80 md:max-h-96 overflow-y-auto">
            {getOrderedSectionKeys(content).map((sectionKey) => (
              <button
                key={sectionKey}
                onClick={() => setEditingSection(sectionKey)}
                className={`w-full text-left px-3 py-2 rounded transition ${
                  editingSection === sectionKey
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {getLabel(sectionKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Editor and preview */}
        <div className="space-y-4">
          {currentSection && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-2">{getLabel(currentSection)}</h3>
                <textarea
                  value={currentContent}
                  onChange={(e) => handleSectionChange(e.target.value)}
                  className="w-full h-48 md:h-64 p-3 border rounded-lg font-mono text-sm"
                  placeholder="Enter section content in Markdown..."
                />
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Preview</h4>
                <div className="border rounded-lg p-4 bg-white dark:bg-gray-900 max-h-64 overflow-y-auto">
                  <MarkdownRenderer content={currentContent} className="text-sm" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
