import type { Instrumentation } from 'next'
import { logAppError } from '@/lib/error-log'

// Next 16 (node_modules/next/dist/server/instrumentation/types.d.ts): `register` and
// `onRequestError` are independent, both optional. Nothing here needs OpenTelemetry setup,
// so only `onRequestError` is exported.
//
// The context object has no `runtime` field in this Next.js version — it carries
// routerKind/routePath/routeType/renderSource/revalidateReason instead. The documented way
// to tell Node.js apart from Edge inside this file is process.env.NEXT_RUNTIME.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    const source = process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'server'
    const error = err instanceof Error ? err : new Error(String(err))

    await logAppError({
      source,
      route: request?.path ?? null,
      message: error.message,
      stack: error.stack ?? null,
      context: {
        routerKind: context?.routerKind,
        routePath: context?.routePath,
        routeType: context?.routeType,
        renderSource: context?.renderSource,
      },
    })
  } catch (loggingErr) {
    // Best-effort: a logging failure must never break the request that triggered it.
    console.error('onRequestError: failed to log error to app_errors', loggingErr)
  }
}
