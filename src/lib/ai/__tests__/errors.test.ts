import { describe, it, expect } from 'vitest'
import { isNonRetryableAIError } from '../errors'

// Shapes taken from the Anthropic/OpenAI SDKs' generated APIError classes
// (node_modules/@anthropic-ai/sdk/core/error.js, node_modules/openai/core/error.js):
// status is the HTTP status, `.error` is what each SDK attaches as the parsed body.
function anthropicApiError(status: number, innerType: string, message: string) {
  const err = new Error(`${status} {"type":"error","error":{"type":"${innerType}","message":"${message}"}}`)
  return Object.assign(err, {
    status,
    error: { type: 'error', error: { type: innerType, message } },
  })
}

function openaiApiError(status: number, innerType: string, message: string) {
  const err = new Error(`${status} ${JSON.stringify({ message, type: innerType })}`)
  return Object.assign(err, {
    status,
    error: { type: innerType, message },
    type: innerType,
  })
}

describe('isNonRetryableAIError', () => {
  it('flags an Anthropic 400 invalid_request_error (insufficient credit) as non-retryable', () => {
    const err = anthropicApiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')
    expect(isNonRetryableAIError(err)).toBe(true)
  })

  it('flags an Anthropic 401 authentication error as non-retryable', () => {
    const err = anthropicApiError(401, 'authentication_error', 'invalid x-api-key')
    expect(isNonRetryableAIError(err)).toBe(true)
  })

  it('flags an OpenAI 400 invalid_request_error as non-retryable', () => {
    const err = openaiApiError(400, 'invalid_request_error', 'insufficient_quota')
    expect(isNonRetryableAIError(err)).toBe(true)
  })

  it('flags an OpenAI 401 authentication error as non-retryable', () => {
    const err = openaiApiError(401, 'authentication_error', 'Incorrect API key provided')
    expect(isNonRetryableAIError(err)).toBe(true)
  })

  it('flags a plain Error whose message still carries the credit-balance wording (structure already lost)', () => {
    const err = new Error(
      'Analysis failed: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
    )
    expect(isNonRetryableAIError(err)).toBe(true)
  })

  it('flags a plain string reason carrying the invalid_request_error token', () => {
    expect(isNonRetryableAIError('400 invalid_request_error: bad request')).toBe(true)
  })

  it('does not flag a 429 rate limit error', () => {
    const err = Object.assign(new Error('429 {"type":"error","error":{"type":"rate_limit_error","message":"rate limited"}}'), {
      status: 429,
      error: { type: 'error', error: { type: 'rate_limit_error' } },
    })
    expect(isNonRetryableAIError(err)).toBe(false)
  })

  it('does not flag a 500 server error', () => {
    const err = Object.assign(new Error('500 {"type":"error","error":{"type":"api_error","message":"internal error"}}'), {
      status: 500,
      error: { type: 'error', error: { type: 'api_error' } },
    })
    expect(isNonRetryableAIError(err)).toBe(false)
  })

  it('does not flag a plain timeout error', () => {
    expect(isNonRetryableAIError(new Error('Request timed out (ETIMEDOUT)'))).toBe(false)
  })

  it('does not flag a generic network/parse error', () => {
    expect(isNonRetryableAIError(new Error('fetch failed'))).toBe(false)
  })

  it('handles non-Error, non-object inputs without throwing', () => {
    expect(isNonRetryableAIError(undefined)).toBe(false)
    expect(isNonRetryableAIError(null)).toBe(false)
    expect(isNonRetryableAIError(42)).toBe(false)
  })
})
