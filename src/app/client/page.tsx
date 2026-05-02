'use client'

import { useLanguage } from '@/lib/i18n-context'
import { TierSelector } from '@/components/client/tier-selector'

export default function ClientEntryPage() {
  const { t } = useLanguage()

  return (
    <>
      <section style={{ background: '#f4ead8', padding: '36px 20px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f8f0df', border: '1px solid #d8c9ad', color: '#a85428', padding: '6px 14px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '18px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c66a3d', display: 'inline-block' }} />
            {t('heroEyebrow')}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'clamp(32px, 7vw, 46px)', lineHeight: 1.05, color: '#2a3520', letterSpacing: '-0.01em', marginBottom: '14px' }}>
            {t('heroHeadline')}<br />
            <span style={{ fontStyle: 'italic', color: '#a85428', fontWeight: 400 }}>{t('heroAccent')}</span>
          </h1>
          <p style={{ fontSize: '15px', color: '#5d4f3f', maxWidth: '480px', margin: '0 auto', lineHeight: 1.6 }}>
            {t('heroLead')}
          </p>
        </div>
      </section>
      <TierSelector />
    </>
  )
}
