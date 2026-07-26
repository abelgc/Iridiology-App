import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Source map upload needs a SENTRY_AUTH_TOKEN and adds a step to every build.
  // Skipped: the errors that matter here are server-side and read fine without it.
  // Add later if client stack traces turn out to be unreadable.
  sourcemaps: { disable: true },
});
