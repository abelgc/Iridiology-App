'use client'

import React, { useState } from 'react'
import { ChevronDown, AlertCircle, Edit2, Loader2 } from 'lucide-react'
import { getSectionLabel, REPORT_SECTION_I18N_KEYS } from '@/types/report'
import { t, type Lang, type TranslationKey } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/shared/markdown-renderer'

interface ReportSectionProps {
  sectionKey: string
  content: string
  lang?: Lang
  isEditing?: boolean
  editingContent?: string
  onEdit?: () => void
  onContentChange?: (value: string) => void
  onSave?: () => Promise<void>
  onCancel?: () => void
  isSaving?: boolean
  saveError?: string | null
  correctionCount?: number
}

function formatAxesAsBullets(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return content

  let lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 1) {
    // Old reports sometimes have every axis crammed into one run-on paragraph
    lines = trimmed.split(/(?=Axis:)/i).map((l) => l.trim()).filter(Boolean)
  }
  if (lines.length <= 1) return content
  if (lines.every((l) => /^[-*]\s/.test(l))) return content

  return lines.map((l) => `- ${l.replace(/^[-*]\s*/, '')}`).join('\n')
}

export function ReportSection({
  sectionKey,
  content,
  lang = 'en',
  isEditing = false,
  editingContent,
  onEdit,
  onContentChange,
  onSave,
  onCancel,
  isSaving = false,
  saveError,
  correctionCount = 0,
}: ReportSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const i18nKey = REPORT_SECTION_I18N_KEYS[sectionKey as keyof typeof REPORT_SECTION_I18N_KEYS] as TranslationKey | undefined
  const label = i18nKey ? t(lang, i18nKey) : getSectionLabel(sectionKey)
  const hasQualityWarning = content.includes('Hallazgo limitado por calidad de imagen')
  const displayContent = sectionKey === 'section_11_detected_axes' ? formatAxesAsBullets(content) : content

  return (
    <div className="border rounded-lg bg-white dark:bg-gray-900 mb-4 print:border-gray-300 print:mb-6">
      <div className="flex items-center justify-between p-4 print:p-0 print:border-b print:pb-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800 dark:active:bg-gray-700 print:hover:bg-transparent print:active:bg-transparent" onClick={() => !isEditing && setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-3 flex-1">
          <ChevronDown
            className={`w-5 h-5 transition-transform print:hidden ${isExpanded ? '' : '-rotate-90'}`}
          />
          <h2 className="text-base md:text-lg font-semibold print:text-base">{label}</h2>
          {hasQualityWarning && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Low Quality
            </Badge>
          )}
          {correctionCount > 0 && (
            <Badge variant="outline" className="ml-auto mr-2">
              {correctionCount} correction{correctionCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {!isEditing && onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="ml-auto print:hidden"
          >
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t print:border-t-0 print:px-0 print:pb-4 print:pt-3">
          {isEditing ? (
            <div className="space-y-3 pt-2">
              <textarea
                value={editingContent ?? content}
                onChange={(e) => onContentChange?.(e.target.value)}
                disabled={isSaving}
                rows={12}
                className="w-full p-3 border rounded-lg font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              {saveError && (
                <p className="text-sm text-red-600">{saveError}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onSave?.()} disabled={isSaving}>
                  {isSaving && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={onCancel} disabled={isSaving}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <MarkdownRenderer content={displayContent} className="text-sm print:text-sm print:leading-relaxed" />
          )}
        </div>
      )}
    </div>
  )
}
