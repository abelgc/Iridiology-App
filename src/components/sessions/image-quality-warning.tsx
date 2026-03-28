'use client'

import { AlertTriangle } from 'lucide-react'

interface ImageQualityWarningProps {
  warnings: string[]
}

export function ImageQualityWarning({ warnings }: ImageQualityWarningProps) {
  if (!warnings || warnings.length === 0) {
    return null
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex gap-3">
        <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-yellow-900 mb-2">Image Quality Issues Detected</p>
          <ul className="space-y-1">
            {warnings.map((warning, index) => (
              <li key={index} className="text-sm text-yellow-800">
                • {warning}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
