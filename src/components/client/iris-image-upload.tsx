'use client'

import { useState } from 'react'
import { useLanguage } from '@/lib/i18n-context'
import {
  validateImage,
  readImageDimensions,
} from '@/lib/client/image-validation'

type Eye = 'right' | 'left'

async function compressImage(file: File, maxDim = 1200, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { naturalWidth: w, naturalHeight: h } = img
      const scale = Math.min(1, maxDim / Math.max(w, h))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas_unavailable')); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('compress_failed')); return }
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('read_failed'))
          reader.readAsDataURL(blob)
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load_failed')) }
    img.src = url
  })
}

export function IrisImageUpload({
  onSubmit,
}: {
  onSubmit: (payload: { right: string; left: string }) => void | Promise<void>
}) {
  const { t } = useLanguage()
  const [right, setRight] = useState<string | null>(null)
  const [left, setLeft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleFile(eye: Eye, file: File) {
    setError(null)
    let dims: { width: number; height: number }
    try {
      dims = await readImageDimensions(file)
    } catch {
      setError(t('errorImageFormat'))
      return
    }
    const validation = await validateImage(file, dims)
    if (!validation.ok) {
      const map = {
        too_large: t('errorImageTooLarge'),
        bad_format: t('errorImageFormat'),
        too_small: t('errorImageDimensions'),
      } as const
      setError(map[validation.reason])
      return
    }
    try {
      const dataUrl = await compressImage(file)
      if (eye === 'right') setRight(dataUrl)
      else setLeft(dataUrl)
    } catch {
      setError(t('errorImageFormat'))
    }
  }

  async function handleSubmit() {
    if (!right || !left) {
      setError(t('errorImageCount'))
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ right, left })
    } finally {
      setSubmitting(false)
    }
  }

  const tips = [t('uploadTip1'), t('uploadTip2'), t('uploadTip3'), t('uploadTip4')]
  const ready = !!right && !!left

  return (
    <>
      <div className="upload-eye-grid">
        <EyeZone
          label={t('uploadRightEye')}
          hint={t('uploadRightEyeHint')}
          preview={right}
          onFile={(f) => handleFile('right', f)}
        />
        <EyeZone
          label={t('uploadLeftEye')}
          hint={t('uploadLeftEyeHint')}
          preview={left}
          onFile={(f) => handleFile('left', f)}
        />
      </div>

      <p style={{ fontSize: 11.5, color: '#9c8272', marginTop: 12, textAlign: 'center' }}>
        {t('uploadFileSpec')}
      </p>

      {error && (
        <p style={{ color: '#c66a3d', fontSize: 13, marginTop: 8 }}>{error}</p>
      )}

      <div className="upload-tips-grid">
        {tips.map((tip, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span className="upload-tip-check">✓</span>
            <span style={{ fontSize: 12.5, color: '#5d4f3f', lineHeight: 1.45, paddingTop: 2 }}>{tip}</span>
          </div>
        ))}
      </div>

      <div className="upload-submit-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#5d4f3f', fontSize: 12 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          {t('uploadSecure')}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!ready || submitting}
          className={`upload-submit-btn ${ready && !submitting ? 'ready' : 'disabled'}`}
        >
          {submitting ? (
            <>
              <span style={{
                width: 14, height: 14,
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#ffffff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }} />
              {t('loading')}
            </>
          ) : (
            <>
              {t('uploadContinueAnalysis')}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M13 8L8 3M13 8L8 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </>
          )}
        </button>
      </div>
    </>
  )
}

function EyeZone({
  label,
  hint,
  preview,
  onFile,
}: {
  label: string
  hint: string
  preview: string | null
  onFile: (file: File) => void
}) {
  const filled = !!preview
  return (
    <label
      className={`upload-zone ${filled ? 'filled' : 'empty'}`}
      onMouseEnter={(e) => {
        if (!filled) {
          e.currentTarget.style.borderColor = '#c66a3d'
          e.currentTarget.style.background = '#ffffff'
        }
      }}
      onMouseLeave={(e) => {
        if (!filled) {
          e.currentTarget.style.borderColor = '#d8c9ad'
          e.currentTarget.style.background = '#f8f0df'
        }
      }}
    >
      {filled ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={label}
          style={{ maxHeight: 200, width: '100%', objectFit: 'contain', borderRadius: 10 }}
        />
      ) : (
        <>
          <span className="upload-zone-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600, color: '#3d4a2a' }}>{label}</span>
          <span style={{ fontSize: 12, color: '#9c8272', lineHeight: 1.4, maxWidth: 200 }}>{hint}</span>
        </>
      )}
      {filled && <span className="upload-zone-check">✓</span>}
      <input
        type="file"
        accept="image/jpeg,image/png"
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
      />
    </label>
  )
}
