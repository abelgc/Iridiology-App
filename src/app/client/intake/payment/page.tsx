'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'

function MockPaymentContent() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      router.replace('/client')
    }
  }, [token, router])

  async function handleContinue() {
    if (!token) return
    setSubmitting(true)
    const res = await fetch('/api/client/payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_download_token: token }),
    })
    setSubmitting(false)
    if (!res.ok) {
      alert(t('error'))
      return
    }
    router.push(`/client/upload?token=${token}`)
  }

  if (!token) return null
  return (
    <section>
      <h2 className="text-2xl font-semibold">{t('paymentMockHeading')}</h2>
      <p className="text-sm opacity-80 mt-2">{t('paymentMockBody')}</p>
      <button
        type="button"
        onClick={handleContinue}
        disabled={submitting}
        className="mt-6 bg-[oklch(0.25_0.06_175)] text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {submitting ? t('loading') : t('continue')}
      </button>
    </section>
  )
}

export default function MockPaymentPage() {
  return (
    <Suspense>
      <MockPaymentContent />
    </Suspense>
  )
}
