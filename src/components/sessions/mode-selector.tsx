'use client'

import { cn } from '@/lib/utils'

type AnalysisMode = 'standard' | 'comparison' | 'technical_review'

interface ModeSelectorProps {
  value: AnalysisMode
  onChange: (mode: AnalysisMode) => void
}

const modes = [
  {
    id: 'standard' as const,
    label: 'Standard',
    description: 'Analyze right and left iris images',
  },
  {
    id: 'comparison' as const,
    label: 'Comparison',
    description: 'Compare previous and current iris images to detect changes',
  },
  {
    id: 'technical_review' as const,
    label: 'Technical Review',
    description: 'Submit your interpretation for AI validation and enrichment',
  },
]

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-gray-700">Analysis Mode</legend>
      <div className="grid gap-3">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={cn(
              'relative flex items-start gap-3 p-4 border-2 rounded-lg text-left transition-colors min-h-[44px]',
              value === mode.id
                ? 'border-[oklch(0.68_0.12_65)] bg-[oklch(0.97_0.04_65)]'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div
              className={cn(
                'flex-shrink-0 w-5 h-5 border-2 rounded-full mt-0.5 transition-colors',
                value === mode.id ? 'border-[oklch(0.68_0.12_65)] bg-[oklch(0.68_0.12_65)]' : 'border-gray-300 bg-white',
              )}
            >
              {value === mode.id && <div className="w-full h-full rounded-full flex items-center justify-center text-white text-xs font-bold">✓</div>}
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{mode.label}</p>
              <p className="text-sm text-gray-600 mt-0.5 hidden sm:block">{mode.description}</p>
            </div>
          </button>
        ))}
      </div>
    </fieldset>
  )
}
