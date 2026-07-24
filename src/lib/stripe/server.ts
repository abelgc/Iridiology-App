import Stripe from 'stripe'

let client: Stripe | null = null

// Lazily constructed so a missing STRIPE_SECRET_KEY only breaks the one request
// that actually needs Stripe, not every cold start of the app.
export function getStripeClient(): Stripe {
  if (!client) {
    const apiKey = process.env.STRIPE_SECRET_KEY
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }
    client = new Stripe(apiKey)
  }
  return client
}
