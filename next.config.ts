import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // The PDF is rendered server-side and reads the brand fonts and logo straight off
  // disk. Next.js does not bundle `public/` into a function's filesystem by default —
  // it is served from the CDN — so without this the two routes that generate a PDF
  // would throw ENOENT in production while working perfectly in local dev.
  outputFileTracingIncludes: {
    '/api/client/internal/stage2': ['./public/fonts/**', './public/logo-solutions.png'],
    '/api/client/reports/[token]/email': ['./public/fonts/**', './public/logo-solutions.png'],
    // The health cron renders a throwaway PDF on every run precisely to prove those two
    // routes above can still find their fonts and logo in production. It needs the same
    // files traced into its own function, or it would report the failure it exists to
    // detect — and report it even when the real routes are fine.
    '/api/client/internal/health': ['./public/fonts/**', './public/logo-solutions.png'],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Source map upload needs a SENTRY_AUTH_TOKEN and adds a step to every build.
  // Skipped: the errors that matter here are server-side and read fine without it.
  // Add later if client stack traces turn out to be unreadable.
  sourcemaps: { disable: true },
});
