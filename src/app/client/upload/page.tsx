'use client'

import { Suspense } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { UploadTutorial } from '@/components/client/upload-tutorial'
import { IrisImageUpload } from '@/components/client/iris-image-upload'
import { AnalysisSplash } from '@/components/client/analysis-splash'
import { PreAnalysisVideo } from '@/components/client/pre-analysis-video'

function ProgressBar() {
  const { t } = useLanguage()
  const steps = [
    { label: t('uploadProgress0'), state: 'done' },
    { label: t('uploadProgress1'), state: 'done' },
    { label: t('uploadProgress2'), state: 'active' },
  ] as const

  return (
    <div className="upload-progress-bar">
      <div className="upload-progress-inner">
        {steps.map((step, i) => (
          <div key={step.label} className="upload-progress-step">
            <div className={`upload-progress-dot ${step.state}`}>
              {step.state === 'done' ? '✓' : String(i + 1)}
            </div>
            <span className={`upload-progress-label ${step.state === 'active' ? 'active' : ''}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UploadContent() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [stage, setStage] = useState<'form' | 'video' | 'analyzing'>('form')
  const pendingUpload = useRef<Promise<Response> | null>(null)

  useEffect(() => {
    if (!token) {
      router.replace('/client')
    }
  }, [token, router])

  function handleSubmit({ right, left }: { right: string; left: string }) {
    if (!token) return
    pendingUpload.current = fetch('/api/client/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        report_download_token: token,
        right_eye_base64: right,
        left_eye_base64: left,
      }),
    })
    setStage('video')
  }

  async function handleVideoContinue() {
    const pending = pendingUpload.current
    if (!pending) return
    setStage('analyzing')
    try {
      const res = await pending
      if (res.status === 413) {
        setStage('form')
        alert(t('errorPayloadTooLarge'))
        return
      }
      if (!res.ok) {
        setStage('form')
        alert(t('error'))
        return
      }
      // Keep the splash up through navigation — it unmounts when the report loads.
      router.replace(`/client/report/${token}`)
    } catch {
      setStage('form')
      alert(t('error'))
    }
  }

  if (!token) return null
  return (
    <>
      {stage === 'video' && <PreAnalysisVideo onContinue={handleVideoContinue} />}
      {stage === 'analyzing' && <AnalysisSplash />}
      <ProgressBar />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 56px' }}>
        <p className="upload-tag">{t('uploadTag')}</p>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 'clamp(28px, 5vw, 40px)',
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: '#3d4a2a',
          marginBottom: 8,
        }}>
          {t('uploadTitle')}
        </h1>
        <p style={{
          color: '#5d4f3f',
          fontSize: 15,
          lineHeight: 1.55,
          marginBottom: 26,
          maxWidth: 600,
        }}>
          {t('uploadLead')}
        </p>

        <div className="upload-card">
          <UploadTutorial />
          <IrisImageUpload onSubmit={handleSubmit} />
        </div>
      </main>
    </>
  )
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadContent />
    </Suspense>
  )
}
