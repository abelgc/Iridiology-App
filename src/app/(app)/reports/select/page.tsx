'use client'

import { useState } from 'react'
import { ReportTierSelector } from '@/components/reports/report-tier-selector'
import type { ReportTier } from '@/components/reports/report-tier-selector'
import { Button } from '@/components/ui/button'

export default function SelectReportPage() {
  const [selectedTier, setSelectedTier] = useState<ReportTier | null>(null)
  const [language, setLanguage] = useState<'es' | 'en'>('es')

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Language toggle */}
        <div className="flex justify-end gap-2 mb-8">
          <button
            type="button"
            onClick={() => setLanguage('es')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              background: language === 'es' ? '#f5a623' : 'transparent',
              color: language === 'es' ? '#ffffff' : 'oklch(0.50 0.03 60)',
              border: '1px solid',
              borderColor: language === 'es' ? 'transparent' : 'oklch(0.88 0.02 80)',
            }}
          >
            🇪🇸 ES
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              background: language === 'en' ? '#f5a623' : 'transparent',
              color: language === 'en' ? '#ffffff' : 'oklch(0.50 0.03 60)',
              border: '1px solid',
              borderColor: language === 'en' ? 'transparent' : 'oklch(0.88 0.02 80)',
            }}
          >
            🇬🇧 EN
          </button>
        </div>

        <ReportTierSelector
          language={language}
          onChange={setSelectedTier}
        />

        {selectedTier && (
          <div className="mt-8">
            <Button
              size="lg"
              className="w-full text-white font-semibold py-3"
              style={{ background: '#f5a623', border: 'none' }}
            >
              {language === 'es'
                ? `Continuar con ${selectedTier === 'basic' ? 'Informe Básico' : 'Informe Premium'}`
                : `Continue with ${selectedTier === 'basic' ? 'Basic Report' : 'Premium Report'}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
