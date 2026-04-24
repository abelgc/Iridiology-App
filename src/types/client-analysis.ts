export type Lang = 'en' | 'es' | 'fr'
export type PaymentTier = 'basic_12' | 'premium_19_90'
export type TimeOfDay = 'morning' | 'evening'
export type ClientAnalysisStatus =
  | 'intake_pending'
  | 'paid'
  | 'analyzing'
  | 'completed'
  | 'failed'

export const TIER_PRICING: Record<PaymentTier, { amount: number; currency: 'EUR' }> = {
  basic_12: { amount: 12.0, currency: 'EUR' },
  premium_19_90: { amount: 19.9, currency: 'EUR' },
}
