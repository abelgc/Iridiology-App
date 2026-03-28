'use client'

import React, { useState } from 'react'
import { ChevronDown, AlertCircle, Edit2 } from 'lucide-react'
import { REPORT_SECTION_LABELS, type ReportSectionKey } from '@/types/report'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/shared/markdown-renderer'

interface ReportSectionProps {
  sectionKey: ReportSectionKey
  content: string
  isEditing?: boolean
  onEdit?: () => void
  correctionCount?: number
}

export function ReportSection({
  sectionKey,
  content,
  isEditing = false,
  onEdit,
  correctionCount = 0,
}: ReportSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const label = REPORT_SECTION_LABELS[sectionKey]
  const hasQualityWarning = content.includes('Hallazgo limitado por calidad de imagen')

  return (
    <div className="border rounded-lg bg-white dark:bg-gray-900 mb-4">
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-3 flex-1">
          <ChevronDown
            className={`w-5 h-5 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
          />
          <h2 className="text-lg font-semibold">{label}</h2>
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
            className="ml-auto"
          >
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t">
          <MarkdownRenderer content={content} className="text-sm" />
        </div>
      )}
    </div>
  )
}
