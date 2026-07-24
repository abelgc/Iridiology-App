export type Lang = 'en' | 'es' | 'de'
export type PaymentTier = 'basic_1990' | 'premium_2990'
export type TimeOfDay = 'morning' | 'evening'
export type ClientAnalysisStatus =
  | 'intake_pending'
  | 'paid'
  | 'analyzing'
  | 'completed'
  | 'failed'

export const TIER_PRICING: Record<PaymentTier, { amount: number; currency: 'EUR' }> = {
  basic_1990: { amount: 19.9, currency: 'EUR' },
  premium_2990: { amount: 29.9, currency: 'EUR' },
}

// EUR-only for now — no currency conversion. `locale` only controls the decimal
// separator convention (en: "19.90", es/de: "19,90"), matching src/lib/i18n.ts.
const CURRENCY_SYMBOLS: Record<(typeof TIER_PRICING)[PaymentTier]['currency'], string> = {
  EUR: '€',
}

function splitAmount(amount: number, locale: Lang): { whole: string; decimal: string } {
  const [whole, fraction = '00'] = amount.toFixed(2).split('.')
  const separator = locale === 'en' ? '.' : ','
  return { whole, decimal: `${separator}${fraction}` }
}

export function formatTierPriceParts(tier: PaymentTier, locale: Lang = 'en'): { whole: string; decimal: string } {
  return splitAmount(TIER_PRICING[tier].amount, locale)
}

export function formatTierPrice(tier: PaymentTier, locale: Lang = 'en'): string {
  const { currency } = TIER_PRICING[tier]
  const { whole, decimal } = splitAmount(TIER_PRICING[tier].amount, locale)
  return `${CURRENCY_SYMBOLS[currency]}${whole}${decimal}`
}

// For displaying a discounted total (amount in cents) using the same
// formatting rules — EUR-only for now, same as TIER_PRICING.
export function formatAmountCents(cents: number, locale: Lang = 'en'): string {
  const { whole, decimal } = splitAmount(cents / 100, locale)
  return `${CURRENCY_SYMBOLS.EUR}${whole}${decimal}`
}
