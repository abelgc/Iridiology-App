'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/shared/markdown-renderer'
import { REPORT_SECTION_LABELS, type ReportSectionKey } from '@/types/report'
import { X } from 'lucide-react'

interface SectionCorrectionProps {
  reportId: string
  patientId: string
  sectionKey: ReportSectionKey
  originalContent: string
  onClose: () => void
  onSaved: () => void
}

export function SectionCorrection({
  reportId,
  patientId,
  sectionKey,
  originalContent,
  onClose,
  onSaved,
}: SectionCorrectionProps) {
  const [correctedText, setCorrectedText] = useState('')
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!correctedText.trim()) {
      setError('Corrected text is required')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/reports/${reportId}/corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_key: sectionKey,
          original_content: originalContent,
          corrected_content: correctedText,
          correction_notes: correctionNotes || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save correction')
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Correct {REPORT_SECTION_LABELS[sectionKey]}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Original content */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Original AI-Generated Text</h3>
            <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-800 max-h-32 overflow-y-auto">
              <MarkdownRenderer content={originalContent} className="text-xs" />
            </div>
          </div>

          {/* Corrected text */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              Corrected Text <span className="text-red-500">*</span>
            </label>
            <textarea
              value={correctedText}
              onChange={(e) => setCorrectedText(e.target.value)}
              className="w-full h-32 p-3 border rounded-lg font-mono text-sm"
              placeholder="Enter your corrected text..."
            />
          </div>

          {/* Correction notes */}
          <div>
            <label className="block text-sm font-semibold mb-2">Correction Notes (Optional)</label>
            <textarea
              value={correctionNotes}
              onChange={(e) => setCorrectionNotes(e.target.value)}
              className="w-full h-20 p-3 border rounded-lg font-mono text-sm"
              placeholder="Explain why this correction was needed..."
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Submit Correction'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
