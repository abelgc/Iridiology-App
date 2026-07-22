'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { formatTierPrice, formatTierPriceParts, type PaymentTier } from '@/types/client-analysis'

const Check = () => (
  <svg viewBox="0 0 12 12" fill="none" width="11" height="11">
    <path d="M2 6.5L5 9.5L10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Arrow = () => (
  <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
    <path d="M3 8H13M13 8L8 3M13 8L8 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function TierSelector() {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [selected, setSelected] = useState<PaymentTier | null>(null)
  const basicPrice = formatTierPriceParts('basic_1990', lang)
  const premiumPrice = formatTierPriceParts('premium_2990', lang)

  function pick(tier: PaymentTier) {
    setSelected(tier)
    setTimeout(() => router.push(`/client/intake?tier=${tier}`), 200)
  }

  return (
    <>
      {/* Cards */}
      <section style={{ padding: '12px 16px 36px', maxWidth: '720px', margin: '0 auto' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Basic */}
          <div className="client-card" style={{ position: 'relative', borderRadius: '22px', padding: '28px 22px 24px', background: '#f8f0df', border: `1.5px solid ${selected === 'basic_1990' ? '#3d4a2a' : '#d8c9ad'}`, color: '#2a1f14' }}>
            <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '12px', padding: '4px 10px', borderRadius: '99px', background: 'rgba(61,74,42,0.08)', color: '#3d4a2a' }}>
              {t('tierBasicTag')}
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '24px', lineHeight: 1.15, marginBottom: '4px' }}>
              {t('tierBasicTitle')}
            </h3>
            <p style={{ fontSize: '13px', color: '#5d4f3f', marginBottom: '18px', lineHeight: 1.5 }}>
              {t('tierBasicDescription')}
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '18px', paddingBottom: '18px', borderBottom: '1px dashed #d8c9ad' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '44px', lineHeight: 1, letterSpacing: '-0.02em', color: '#3d4a2a' }}>
                €{basicPrice.whole}<span style={{ fontSize: '22px', fontWeight: 500, opacity: 0.8 }}>{basicPrice.decimal}</span>
              </span>
              <span style={{ fontSize: '13px', color: '#5d4f3f' }}>{t('tierPriceSuffix')}</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '22px' }}>
              {(['tierBasicFeat1', 'tierBasicFeat2', 'tierBasicFeat3', 'tierBasicFeat4'] as const).map(key => (
                <li key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13.5px', lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: '#3d4a2a', color: '#f4ead8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
                    <Check />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => pick('basic_1990')} className="cta-basic">
              {t('tierBasicCta')}
            </button>
          </div>

          {/* Premium */}
          <div className="client-card" style={{ position: 'relative', borderRadius: '22px', padding: '28px 22px 24px', background: '#3d4a2a', border: `1.5px solid ${selected === 'premium_2990' ? '#d4a04a' : '#3d4a2a'}`, color: '#f4ead8', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 100% 0%, rgba(198,106,61,0.28) 0%, transparent 50%), radial-gradient(ellipse at 0% 100%, rgba(212,160,74,0.12) 0%, transparent 55%)' }} />
            <span style={{ position: 'absolute', top: '16px', right: '16px', background: '#c66a3d', color: 'white', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: '99px', zIndex: 2, boxShadow: '0 4px 12px rgba(198,106,61,0.35)' }}>
              {t('tierPremiumBadge')}
            </span>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '12px', padding: '4px 10px', borderRadius: '99px', background: 'rgba(244,234,216,0.15)', color: '#f4ead8', border: '1px solid rgba(244,234,216,0.2)' }}>
                {t('tierPremiumTag')}
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '24px', lineHeight: 1.15, marginBottom: '4px', color: '#f4ead8' }}>
                {t('tierPremiumTitle')}
              </h3>
              <p style={{ fontSize: '13px', color: 'rgba(244,234,216,0.75)', marginBottom: '18px', lineHeight: 1.5 }}>
                {t('tierPremiumDescription')}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '18px', paddingBottom: '18px', borderBottom: '1px dashed rgba(244,234,216,0.18)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '44px', lineHeight: 1, letterSpacing: '-0.02em', color: '#d4a04a' }}>
                  €{premiumPrice.whole}<span style={{ fontSize: '22px', fontWeight: 500, opacity: 0.8 }}>{premiumPrice.decimal}</span>
                </span>
                <span style={{ fontSize: '13px', color: 'rgba(244,234,216,0.6)' }}>{t('tierPriceSuffix')}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '22px' }}>
                {(['tierPremiumFeat1', 'tierPremiumFeat2', 'tierPremiumFeat3', 'tierPremiumFeat4'] as const).map(key => (
                  <li key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13.5px', lineHeight: 1.5, color: 'rgba(244,234,216,0.92)' }}>
                    <span style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: '#d4a04a', color: '#2a3520', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
                      <Check />
                    </span>
                    {t(key)}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => pick('premium_2990')} className="cta-premium">
                {t('tierPremiumCta')} <Arrow />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* Comparison table */}
      <section style={{ maxWidth: '720px', margin: '0 auto 24px', padding: '0 16px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '22px', color: '#2a3520', textAlign: 'center', marginBottom: '4px' }}>
          {t('compareTitle')}
        </h2>
        <p style={{ textAlign: 'center', color: '#5d4f3f', fontSize: '13px', marginBottom: '20px' }}>
          {t('compareSub')}
        </p>
        <div style={{ background: '#f8f0df', border: '1px solid #d8c9ad', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', padding: '12px 16px', background: '#3d4a2a', color: '#f4ead8' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t('compareColFeature')}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '14px', fontWeight: 500, textAlign: 'center' }}>{t('compareColBasic')}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '14px', fontWeight: 500, textAlign: 'center' }}>{t('compareColPremium')}</span>
          </div>
          {([
            [t('compareRow1'), true, true],
            [t('compareRow2'), true, true],
            [t('compareRow3'), false, true],
            [t('compareRow4'), false, true],
            [t('compareRow6'), true, true],
            [t('compareRow7'), false, true],
          ] as [string, boolean, boolean][]).map(([label, basic, premium], i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid #d8c9ad', fontSize: '13px' }}>
              <span style={{ color: '#2a1f14', fontWeight: 500 }}>{label}</span>
              <span style={{ textAlign: 'center' }}>
                {basic ? <span style={{ color: '#5a6e3a', fontSize: '18px', fontWeight: 700 }}>✓</span> : <span style={{ color: '#d8c9ad', fontSize: '18px' }}>—</span>}
              </span>
              <span style={{ textAlign: 'center' }}>
                {premium ? <span style={{ color: '#a85428', fontSize: '18px', fontWeight: 700 }}>✓</span> : <span style={{ color: '#d8c9ad', fontSize: '18px' }}>—</span>}
              </span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', alignItems: 'center', padding: '13px 16px', fontSize: '13px' }}>
            <span style={{ color: '#2a1f14', fontWeight: 500 }}>{t('compareRowPrice')}</span>
            <span style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '17px', color: '#3d4a2a', fontWeight: 600 }}>{formatTierPrice('basic_1990', lang)}</span>
            <span style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '17px', color: '#a85428', fontWeight: 600 }}>{formatTierPrice('premium_2990', lang)}</span>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <div style={{ background: '#ecdfc6', padding: '22px 16px', display: 'flex', justifyContent: 'center', gap: '28px', flexWrap: 'wrap', borderTop: '1px solid #d8c9ad', borderBottom: '1px solid #d8c9ad', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#3d4a2a', fontWeight: 500 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#a85428" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="3" /><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /></svg>
          {t('trustReading')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#3d4a2a', fontWeight: 500 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#a85428" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10" /><polyline points="9 11 12 14 22 4" /></svg>
          {t('trustPayment')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#3d4a2a', fontWeight: 500 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#a85428" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          {t('trustInstant')}
        </div>
      </div>

      {/* Disclaimer */}
      <p style={{ maxWidth: '600px', margin: '0 auto 40px', padding: '0 24px', textAlign: 'center', color: '#5d4f3f', fontSize: '11.5px', lineHeight: 1.6, fontStyle: 'italic', opacity: 0.75 }}>
        {t('disclaimer')}
      </p>
    </>
  )
}
