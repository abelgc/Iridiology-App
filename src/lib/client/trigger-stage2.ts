export async function triggerStage2(token: string): Promise<void> {
  // VERCEL_URL points at the per-deployment URL, which Vercel protects with SSO by
  // default — any request to it (even server-to-server, even with our own secret)
  // gets redirected to a Vercel login page before our route ever runs. The stable
  // production domain is not behind that wall.
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
  try {
    await fetch(`${baseUrl}/api/client/internal/stage2`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-trigger-secret': process.env.INTERNAL_TRIGGER_SECRET ?? '',
      },
      body: JSON.stringify({ report_download_token: token }),
    })
  } catch (err) {
    // Best-effort — if this fails, the staleness-driven retry in
    // /api/client/reports/[token]/route.ts will re-trigger it.
    console.error(`[trigger-stage2] token ${token} — trigger call failed:`, err)
  }
}
