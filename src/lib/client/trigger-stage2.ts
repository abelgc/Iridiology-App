export async function triggerStage2(token: string): Promise<void> {
  // VERCEL_PROJECT_PRODUCTION_URL is set on EVERY deployment, previews included — so
  // preferring it unconditionally made a preview's stage 1 hand the work to production:
  // staging ran production's code and wrote production's rows, and testing a fix on
  // staging silently tested the thing it was meant to replace. Gate it on VERCEL_ENV.
  const isProduction = process.env.VERCEL_ENV === 'production'
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

  const baseUrl =
    isProduction && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000'

  // Preview deployments sit behind Vercel Authentication, so calling our own deployment
  // server-to-server is answered with a 302 to vercel.com/sso-api before the route runs
  // — measured by hand against the staging alias: 302 without this header, 200 with it.
  // That redirect is the reason the original code pointed at production instead.
  // Production is not protected and the secret is absent there, so this adds nothing.
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-internal-trigger-secret': process.env.INTERNAL_TRIGGER_SECRET ?? '',
  }
  if (!isProduction && bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret
  }

  try {
    await fetch(`${baseUrl}/api/client/internal/stage2`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ report_download_token: token }),
    })
  } catch (err) {
    // Best-effort — if this fails, the staleness-driven retry in
    // /api/client/reports/[token]/route.ts will re-trigger it.
    console.error(`[trigger-stage2] token ${token} — trigger call failed:`, err)
  }
}
