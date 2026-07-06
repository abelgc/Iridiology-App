'use client'

import { useLanguage } from '@/lib/i18n-context'

export function PreAnalysisVideo({ onContinue }: { onContinue: () => void }) {
  const { t } = useLanguage()

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#f4ead8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 24px',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 24,
          color: '#2a3520',
          letterSpacing: '-0.01em',
          marginBottom: 20,
        }}
      >
        {t('preAnalysisVideoHeading')}
      </h1>

      <div
        style={{
          width: 'min(320px, 78vw)',
          aspectRatio: '9 / 16',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000',
          marginBottom: 26,
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}
      >
        <iframe
          src="https://www.youtube.com/embed/Gq9X-V8d3bc?autoplay=1&mute=1&playsinline=1&rel=0"
          title="Iris analysis intro video"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="bg-[oklch(0.25_0.06_175)] text-white rounded px-4 py-2"
      >
        {t('continue')}
      </button>
    </div>
  )
}
