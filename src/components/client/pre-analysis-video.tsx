'use client'

import { useEffect } from 'react'
import { useLanguage } from '@/lib/i18n-context'

export function PreAnalysisVideo({ onContinue }: { onContinue: () => void }) {
  const { t } = useLanguage()

  useEffect(() => {
    const timer = setTimeout(onContinue, 10000)
    return () => clearTimeout(timer)
  }, [onContinue])

  const steps = [
    { key: 'preAnalysisVideoStep0' as const, status: 'done' as const },
    { key: 'preAnalysisVideoStep1' as const, status: 'active' as const },
    { key: 'preAnalysisVideoStep2' as const, status: 'pending' as const },
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
        overflowY: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 4vh, 48px) clamp(16px, 4vw, 40px)',
      }}
    >
      <style>{`
        @keyframes pavSpin { to { transform: rotate(360deg); } }
        @keyframes pavPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes pavBar { 0% { width: 20%; } 50% { width: 78%; } 100% { width: 20%; } }

        .pav-card {
          width: 100%;
          max-width: 960px;
          background: linear-gradient(180deg, #fbf5e9, #f4ead8);
          border: 1px solid #d8c9ad;
          border-radius: 28px;
          box-shadow: 0 24px 60px -28px rgba(42,31,20,0.35);
          padding: clamp(24px, 4vw, 44px);
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: clamp(28px, 4vw, 52px);
          align-items: center;
        }
        .pav-left { text-align: left; }
        .pav-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          letter-spacing: 0.18em;
          font-weight: 600;
          text-transform: uppercase;
          color: #3d4a2a;
          margin-bottom: 14px;
        }
        .pav-eyebrow-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #3d4a2a;
          animation: pavPulse 1.8s ease-in-out infinite;
        }
        .pav-heading {
          font-family: var(--font-display);
          font-weight: 500;
          font-size: clamp(28px, 3.4vw, 40px);
          line-height: 1.08;
          color: #2a3520;
          margin: 0 0 14px;
        }
        .pav-lead {
          font-size: 16px;
          line-height: 1.6;
          color: #5b5040;
          max-width: 38ch;
          margin: 0 0 22px;
        }
        .pav-steps {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin: 0 0 20px;
        }
        .pav-step {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14.5px;
          color: #5b5040;
        }
        .pav-step-icon {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: #fff;
        }
        .pav-step-icon.done { background: #3d4a2a; }
        .pav-step-icon.active {
          border: 2px solid rgba(61,74,42,0.22);
          border-top-color: #3d4a2a;
          animation: pavSpin 0.9s linear infinite;
        }
        .pav-step-icon.pending { border: 1.5px solid #d8c9ad; }
        .pav-progress-track {
          height: 6px;
          border-radius: 99px;
          background: #efe2ca;
          overflow: hidden;
          position: relative;
        }
        .pav-progress-fill {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          border-radius: 99px;
          background: linear-gradient(90deg, #3d4a2a, #5a6b3c);
          animation: pavBar 2.6s ease-in-out infinite;
        }
        .pav-right {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 300px;
          margin: 0 auto;
        }
        .pav-frame {
          position: relative;
          aspect-ratio: 9 / 16;
          height: min(64vh, 540px);
          max-width: 300px;
          margin: 0 auto;
          border-radius: 20px;
          overflow: hidden;
          background: #0c0c0c;
          box-shadow: 0 18px 44px -18px rgba(42,31,20,0.55);
        }
        .pav-loading {
          position: absolute;
          inset: 0;
          z-index: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(180deg, #14210f, #0c0c0c);
        }
        .pav-spinner {
          width: 34px;
          height: 34px;
          border: 3px solid rgba(255,255,255,0.25);
          border-top-color: #fff;
          border-radius: 50%;
          animation: pavSpin 0.9s linear infinite;
        }
        .pav-iframe {
          position: absolute;
          inset: 0;
          z-index: 1;
          width: 100%;
          height: 100%;
          border: 0;
        }
        .pav-caption {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2;
          pointer-events: none;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 16px 12px 12px;
          background: linear-gradient(0deg, rgba(0,0,0,0.72), transparent);
        }
        .pav-caption-badge {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #f4ead8;
          color: #2a3520;
          font-family: var(--font-serif, Georgia, serif);
          font-weight: 700;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pav-caption-text {
          font-size: 13px;
          font-weight: 700;
          color: #f4ead8;
        }
        .pav-hint {
          font-size: 12.5px;
          color: #8a7d68;
          text-align: center;
          margin-top: 10px;
        }
        .pav-cta {
          grid-column: 1 / -1;
          display: flex;
          justify-content: center;
          margin-top: clamp(20px, 3vw, 32px);
        }
        .pav-continue {
          background: #2a3520;
          color: #f4ead8;
          font-size: 15px;
          font-weight: 600;
          padding: 13px 30px;
          border-radius: 12px;
          min-height: 48px;
          border: 0;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .pav-continue:hover {
          background: #1d2716;
          transform: translateY(-1px);
        }

        @media (max-width: 760px) {
          .pav-card { grid-template-columns: 1fr; }
          .pav-left { text-align: center; }
          .pav-eyebrow { justify-content: center; }
          .pav-lead { margin-left: auto; margin-right: auto; }
          .pav-steps { margin-left: auto; margin-right: auto; width: fit-content; text-align: left; }
          .pav-right { order: -1; }
          .pav-frame { height: min(52vh, 460px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .pav-eyebrow-dot,
          .pav-spinner,
          .pav-step-icon.active,
          .pav-progress-fill {
            animation: none !important;
          }
        }
      `}</style>

      <div className="pav-card">
        <div className="pav-left">
          <div className="pav-eyebrow">
            <span className="pav-eyebrow-dot" />
            {t('preAnalysisVideoEyebrow')}
          </div>

          <h1 className="pav-heading">{t('preAnalysisVideoHeading')}</h1>
          <p className="pav-lead">{t('preAnalysisVideoLead')}</p>

          <div className="pav-steps">
            {steps.map((step) => (
              <div key={step.key} className="pav-step">
                <span className={`pav-step-icon ${step.status}`}>
                  {step.status === 'done' ? '✓' : null}
                </span>
                <span>{t(step.key)}</span>
              </div>
            ))}
          </div>

          <div className="pav-progress-track">
            <div className="pav-progress-fill" />
          </div>
        </div>

        <div className="pav-right">
          <div className="pav-frame">
            <div className="pav-loading">
              <div className="pav-spinner" />
            </div>
            <iframe
              src="https://www.youtube.com/embed/Gq9X-V8d3bc?autoplay=1&mute=1&playsinline=1&rel=0"
              title="Iris analysis intro video"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="pav-iframe"
            />
            <div className="pav-caption">
              <span className="pav-caption-badge">N</span>
              <span className="pav-caption-text">Narasimha Solutions</span>
            </div>
          </div>
          <p className="pav-hint">{t('preAnalysisVideoHint')}</p>
        </div>

        <div className="pav-cta">
          <button type="button" onClick={onContinue} className="pav-continue">
            {t('continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
