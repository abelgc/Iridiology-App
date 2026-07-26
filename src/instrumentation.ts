import * as Sentry from '@sentry/nextjs'

// Next.js calls register() once per runtime at server start. NEXT_RUNTIME tells us which
// one we're in, so each gets its matching Sentry config rather than loading Node-only code
// into the edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

// Without this, a thrown error inside a React Server Component is swallowed by Next's own
// error boundary and never reaches Sentry — which would leave exactly the class of silent
// failure this whole change exists to eliminate.
export const onRequestError = Sentry.captureRequestError
