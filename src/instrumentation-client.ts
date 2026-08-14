// Next's client instrumentation hook (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md):
// runs once at module scope after the HTML loads, before hydration. No React component
// needed — this file registers listeners for the app's entire lifetime.

function report(message: string, stack: string | undefined | null, context: Record<string, unknown>) {
  try {
    fetch('/api/client/internal/log-error', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stack: stack ?? undefined, context }),
    }).catch(() => {
      // Fire-and-forget: a failed beacon must never surface to the user or recurse into
      // another error.
    })
  } catch {
    // JSON.stringify or fetch construction itself failed — still must not throw back into
    // the error handler that called us.
  }
}

window.addEventListener('error', (event) => {
  const err = event.error
  report(
    err instanceof Error ? err.message : String(event.message ?? 'unknown error'),
    err instanceof Error ? err.stack : undefined,
    {
      type: 'error',
      url: window.location.href,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  )
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  report(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined, {
    type: 'unhandledrejection',
    url: window.location.href,
  })
})
