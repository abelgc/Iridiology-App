import * as Sentry from '@sentry/nextjs'

// Server-side errors are the ones that actually cost money here: a stage-1 or stage-2
// failure means a client paid and got nothing, and until now the only record was a
// console.error in Vercel logs that expire. This is the piece that turns "I found out
// from the client's face" into a push notification.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Errors only, no performance tracing. Tracing draws from a separate quota and adds
  // noise; the open question in this project is "what broke", not "what was slow" —
  // stage timings are already measured off timestamps in client_analyses. Turn this up
  // later if that changes.
  tracesSampleRate: 0,

  // Never send anything in local development — otherwise a debugging session floods the
  // 5,000/month free quota with errors nobody needs to see.
  enabled: process.env.NODE_ENV === 'production',

  // Tags every event with which deploy produced it, so a regression is traceable to a
  // specific commit instead of "sometime last week".
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? 'development',
})
