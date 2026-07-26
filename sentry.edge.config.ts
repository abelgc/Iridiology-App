import * as Sentry from '@sentry/nextjs'

// The proxy (src/proxy.ts) runs in this runtime. It is the file that has caused the most
// production incidents in this project — the /intro.mp4 redirect, the robots.txt redirect —
// and failures there are invisible because a redirect looks like a successful response.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  enabled: process.env.NODE_ENV === 'production',
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? 'development',
})
