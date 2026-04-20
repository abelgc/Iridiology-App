'use client'

import { useState } from 'react'
import { useLanguage } from '@/lib/i18n-context'
import {
  validateImage,
  readImageDimensions,
  IMAGE_MAX_BYTES,
} from '@/lib/client/image-validation'

type Eye = 'right' | 'left'

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read_failed'))
    reader.readAsDataURL(file)
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
    const dataUrl = await fileToDataUrl(file)
    if (eye === 'right') setRight(dataUrl)
    else setLeft(dataUrl)
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

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-4">
        <EyeZone label={t('uploadRightEye')} preview={right} onFile={(f) => handleFile('right', f)} />
        <EyeZone label={t('uploadLeftEye')} preview={left} onFile={(f) => handleFile('left', f)} />
      </div>
      {error && <p className="text-destructive mt-4">{error}</p>}
      <p className="text-xs opacity-70 mt-2">
        Max {IMAGE_MAX_BYTES / 1024 / 1024} MB · JPEG/PNG · ≥ 800×800
      </p>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!right || !left || submitting}
        className="mt-6 bg-[oklch(0.25_0.06_175)] text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {submitting ? t('loading') : t('continue')}
      </button>
    </div>
  )
}

function EyeZone({
  label,
  preview,
  onFile,
}: {
  label: string
  preview: string | null
  onFile: (file: File) => void
}) {
  return (
    <label className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-white">
      <span className="font-medium mb-2">{label}</span>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={label} className="max-h-48 object-contain" />
      ) : (
        <span className="text-sm opacity-60">+</span>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
      />
    </label>
  )
}
