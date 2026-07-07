'use client'

import { useEffect } from 'react'
import { useLanguage } from '@/lib/i18n-context'

export function PreAnalysisVideo({ onContinue }: { onContinue: () => void }) {
  const { t } = useLanguage()

  useEffect(() => {
    const timer = setTimeout(onContinue, 10000)
    return () => clearTimeout(timer)
  }, [onContinue])

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
        padding: 'clamp(20px, 5vh, 40px) 24px',
        gap: 0,
        overflowY: 'auto',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'clamp(20px, 4.5vw, 26px)',
          color: '#2a3520',
          letterSpacing: '-0.01em',
          marginBottom: 'clamp(14px, 3vh, 22px)',
        }}
      >
        {t('preAnalysisVideoHeading')}
      </h1>

      <div
        style={{
          position: 'relative',
          aspectRatio: '9 / 16',
          height: 'min(72vh, 560px)',
          maxWidth: '86vw',
          borderRadius: 16,
          overflow: 'hidden',
          background: '#0c0c0c',
          marginBottom: 26,
          boxShadow: '0 12px 40px rgba(42,53,32,0.20)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg,#14210f,#0c0c0c)',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              border: '3px solid rgba(255,255,255,0.25)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite',
            }}
          />
        </div>
        <iframe
          src="https://www.youtube.com/embed/ZeRh5ODhEi4?autoplay=1&mute=1&playsinline=1&rel=0"
          title="Iris analysis intro video"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ position: 'relative', width: '100%', height: '100%', border: 0, zIndex: 1 }}
        />
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="bg-[oklch(0.25_0.06_175)] hover:bg-[oklch(0.30_0.06_175)] text-white rounded-lg px-6 py-3 text-[15px] font-medium transition-colors"
      >
        {t('continue')}
      </button>
    </div>
  )
}
