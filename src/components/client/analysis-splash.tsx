'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/lib/i18n-context'

const MSGS = ['splashMsg0', 'splashMsg1', 'splashMsg2', 'splashMsg3'] as const

export function AnalysisSplash() {
  const { t } = useLanguage()
  const [msgIdx, setMsgIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % 4)
        setVisible(true)
      }, 300)
    }, 2500)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: 18, textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ width: 44, height: 44, border: '3px solid #d8c9ad', borderTopColor: '#3d4a2a', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, color: '#2a3520', margin: 0 }}>
        {t('splashTitle')}
      </p>
      <p style={{ fontSize: 14, color: '#5d4f3f', margin: 0, minHeight: 22, opacity: visible ? 1 : 0, transition: 'opacity 0.3s' }}>
        {t(MSGS[msgIdx])}
      </p>
      <p style={{ fontSize: 12.5, color: '#9c8272', margin: 0, maxWidth: 360 }}>
        {t('splashNote')}
      </p>
    </div>
  )
}
