/**
 * Distinguishes AI provider errors that can never succeed on retry (bad/revoked API key,
 * insufficient account credit) from transient ones (timeouts, 5xx, rate limits) that are
 * worth retrying.
 *
 * Handles two shapes the same underlying failure can arrive in:
 *  - The raw Anthropic/OpenAI SDK `APIError`, still intact when we catch a `provider.complete()`
 *    call directly — has `.status` and `.error` (the parsed response body).
 *  - A flattened message string, once an error has already been reduced to `.message` by an
 *    intermediate layer (e.g. `Promise.allSettled`'s `reason?.message`, or a rethrown `Error`).
 *    We fall back to matching the well-known error-type tokens Anthropic/OpenAI put in that
 *    message (`invalid_request_error`, `authentication_error`) plus the specific insufficient-
 *    credit wording, so detection still works after the structured fields are gone.
 */

interface ApiErrorLike {
  status?: number
  // Anthropic: `error` is the raw response body, e.g.
  //   { type: 'error', error: { type: 'invalid_request_error', message } }
  // OpenAI: `error` is already the inner `error` object, e.g.
  //   { type: 'invalid_request_error', message, code, param }
  error?: { type?: string; error?: { type?: string } } | null
}

const NON_RETRYABLE_MESSAGE_PATTERN =
  /invalid_request_error|authentication_error|credit balance is too low/i

export function isNonRetryableAIError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as ApiErrorLike
    const innerType = err.error?.type ?? err.error?.error?.type
    if (err.status === 400 && innerType === 'invalid_request_error') return true
    if (err.status === 401) return true
  }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return NON_RETRYABLE_MESSAGE_PATTERN.test(message)
}
