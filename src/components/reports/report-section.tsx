'use client'

import React, { useState } from 'react'
import { ChevronDown, AlertCircle, Edit2, Loader2 } from 'lucide-react'
import { REPORT_SECTION_LABELS, type ReportSectionKey } from '@/types/report'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/shared/markdown-renderer'

interface ReportSectionProps {
  sectionKey: ReportSectionKey
  content: string
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

export function ReportSection({
  sectionKey,
  content,
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
  const label = REPORT_SECTION_LABELS[sectionKey]
  const hasQualityWarning = content.includes('Hallazgo limitado por calidad de imagen')

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
            <MarkdownRenderer content={content} className="text-sm print:text-sm print:leading-relaxed" />
          )}
        </div>
      )}
    </div>
  )
}
