'use client'

import { useLanguage } from '@/lib/i18n-context'

/**
 * Full-screen splash shown while the client's iris analysis is running.
 * Pure CSS animation (no images) — brand olive + gold on cream.
 * Drop <AnalysisSplash /> in whenever you're awaiting the analysis.
 */
export function AnalysisSplash() {
  const { t } = useLanguage()

  const messages = [
    t('splashMsg0'),
    t('splashMsg1'),
    t('splashMsg2'),
    t('splashMsg3'),
  ]

  return (
    <div
      role="status"
      aria-live="polite"
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
      <style>{`
        @keyframes irisSpin { to { transform: rotate(360deg); } }
        @keyframes pupilPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.16); } }
        @keyframes barSlide { 0% { left: -42%; } 100% { left: 100%; } }
        @keyframes rotMsg {
          0% { opacity: 0; transform: translateY(6px); }
          3% { opacity: 1; transform: translateY(0); }
          22% { opacity: 1; transform: translateY(0); }
          25% { opacity: 0; transform: translateY(-6px); }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .as-iris, .as-scan, .as-ring, .as-pupil { animation: none !important; }
          .as-rotator span { animation-duration: 0.01s; }
        }
      `}</style>

      <div style={{ width: 148, height: 148, position: 'relative', marginBottom: 30 }}>
        <div
          className="as-ring"
          style={{
            position: 'absolute', inset: -14, borderRadius: '50%',
            border: '1.5px dashed rgba(61,74,42,0.4)',
            animation: 'irisSpin 22s linear infinite reverse',
          }}
        />
        <div
          className="as-iris"
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background:
              'radial-gradient(circle at 50% 50%,#1c1208 0 13%,transparent 13.5%),' +
              'repeating-conic-gradient(from 0deg,#6b7a3f 0deg 4deg,#3d4a2a 4deg 8deg)',
            boxShadow:
              'inset 0 0 0 3px #3d4a2a, inset 0 0 30px 6px rgba(28,18,8,0.55),' +
              '0 0 0 6px #f4ead8, 0 0 0 7px #d8c9ad',
            animation: 'irisSpin 14s linear infinite',
          }}
        />
        <div
          className="as-scan"
          style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            background:
              'conic-gradient(from 0deg,transparent 0 78%,rgba(212,160,74,0) 80%,rgba(212,160,74,0.85) 92%,transparent 100%)',
            WebkitMask: 'radial-gradient(circle,transparent 47%,#000 48%)',
            mask: 'radial-gradient(circle,transparent 47%,#000 48%)',
            animation: 'irisSpin 2.6s linear infinite',
          }}
        />
        <div
          className="as-pupil"
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 50%,rgba(28,18,8,0.9) 0 12%,transparent 13%)',
            animation: 'pupilPulse 3.4s ease-in-out infinite',
          }}
        />
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 27,
          color: '#2a3520', letterSpacing: '-0.01em', lineHeight: 1.12, marginBottom: 12,
        }}
      >
        {t('splashTitle')}
      </h1>

      <div className="as-rotator" style={{ height: 26, position: 'relative', width: 'min(420px,90vw)', marginBottom: 26 }}>
        {messages.map((msg, i) => (
          <span
            key={i}
            style={{
              position: 'absolute', inset: 0,
              fontFamily: 'var(--font-serif)', fontSize: 19, color: '#5d4f3f',
              opacity: 0,
              animation: 'rotMsg 14s linear infinite',
              animationDelay: `${i * 3.5}s`,
            }}
          >
            {msg}
          </span>
        ))}
      </div>

      <div
        style={{
          height: 5, width: 230, borderRadius: 99, marginBottom: 18,
          background: 'rgba(61,74,42,0.14)', overflow: 'hidden', position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute', top: 0, left: 0, height: '100%', width: '42%', borderRadius: 99,
            background: 'linear-gradient(90deg,#d4a04a,#c98a2e)',
            animation: 'barSlide 1.8s ease-in-out infinite',
          }}
        />
      </div>

      <p style={{ fontSize: 12.5, color: '#5d4f3f', opacity: 0.85, letterSpacing: '0.01em' }}>
        {t('splashNote')}
      </p>
    </div>
  )
}
