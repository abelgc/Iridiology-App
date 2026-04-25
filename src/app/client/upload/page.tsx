'use client'

import { Suspense } from 'react'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { UploadTutorial } from '@/components/client/upload-tutorial'
import { IrisImageUpload } from '@/components/client/iris-image-upload'

function UploadContent() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      router.replace('/client')
    }
  }, [token, router])

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
      router.replace(`/client/upload?token=${token}`)
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

export default function UploadPage() {
  return (
    <Suspense>
      <UploadContent />
    </Suspense>
  )
}
