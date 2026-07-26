import * as Sentry from '@sentry/nextjs'

// Browser-side errors. Lower priority than the server ones, but this is what would catch a
// client whose upload page throws before it ever reaches an API — a failure that today
// leaves no trace anywhere at all, since the row is never created.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  enabled: process.env.NODE_ENV === 'production',
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? 'development',
})

// Required by Next.js so Sentry can measure client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
