'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { UploadTutorial } from '@/components/client/upload-tutorial'
import { IrisImageUpload } from '@/components/client/iris-image-upload'

export default function UploadPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const stored = window.sessionStorage.getItem('client_token')
    if (!stored) {
      router.replace('/client')
      return
    }
    setToken(stored)
  }, [router])

  async function handleSubmit({ right, left }: { right: string; left: string }) {
    if (!token) return
    router.push('/client/upload/processing')
    const res = await fetch('/api/client/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        report_download_token: token,
        right_eye_base64: right,
        left_eye_base64: left,
      }),
    })
    if (!res.ok) {
      router.replace('/client/upload')
      alert(t('error'))
      return
    }
    router.replace(`/client/report/${token}`)
  }

  if (!token) return null
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4">{t('uploadTitle')}</h2>
      <UploadTutorial />
      <IrisImageUpload onSubmit={handleSubmit} />
    </section>
  )
}
