import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentPage from '../page'

const pushMock = vi.fn()
const replaceMock = vi.fn()
// The customer-facing notice is now an in-page toast, not a native alert. The promise
// under test is unchanged — the client is told, and the diagnostic code travels with
// the message — so these assertions follow the notice rather than the mechanism.
const toastMock = vi.fn()
let searchParamValues: Record<string, string> = { token: 'test-token', tier: 'basic_1990' }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => ({ get: (key: string) => searchParamValues[key] ?? null }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn(), toasts: [] }),
}))

vi.mock('@/lib/i18n-context', () => ({
  useLanguage: () => ({ t: (key: string) => key, lang: 'en' }),
}))

describe('PaymentPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
    replaceMock.mockClear()
    toastMock.mockClear()
    searchParamValues = { token: 'test-token', tier: 'basic_1990' }
    global.fetch = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    })
  })

  it('without a discount code, creates a Checkout Session and redirects the browser to it', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/test-session' }),
    })
    const user = userEvent.setup()
    render(<PaymentPage />)

    await user.click(screen.getByRole('button', { name: 'paymentCta' }))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/client/payment/checkout-session',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(window.location.href).toBe('https://checkout.stripe.com/test-session')
    expect(pushMock).not.toHaveBeenCalled()
  })

  // The server answers 200 with no `url` when the row has already been paid
  // (back-button replay, reload-then-retry). The page read the missing `url` as
  // a failure and showed a paying customer "Algo salió mal" instead of taking
  // them to the upload step. It now follows the server's stated destination.
  it('REGRESSION (2026-07-26 live-demo incident): an already-paid order goes forward to upload instead of alerting', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        outcome: 'already_paid',
        redirect_to: '/client/upload?token=test-token',
        report_download_token: 'test-token',
        status: 'paid',
      }),
    })
    const user = userEvent.setup()
    render(<PaymentPage />)

    await user.click(screen.getByRole('button', { name: 'paymentCta' }))

    expect(toastMock).not.toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith('/client/upload?token=test-token')
    expect(window.location.href).toBe('')
  })

  // During a rolling deploy a browser can be running the new bundle while a
  // still-warm serverless instance answers with the old bare {token, status}
  // shape. That must not resurrect the incident for the customers unlucky
  // enough to click during the deploy window.
  it('REGRESSION (2026-07-26 live-demo incident): still goes forward when a stale server returns the old bare status shape with no outcome', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ report_download_token: 'test-token', status: 'paid' }),
    })
    const user = userEvent.setup()
    render(<PaymentPage />)

    await user.click(screen.getByRole('button', { name: 'paymentCta' }))

    expect(toastMock).not.toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith('/client/upload?token=test-token')
  })

  // Six different situations all alerted the identical "Something went wrong",
  // so during the live demo the owner could not tell which one he was looking
  // at. New user-facing copy would need en/es/de translations, so each failure
  // instead carries a short diagnostic code the owner can read out.
  it('a genuine failure still surfaces an error, tagged with the server reason so causes are distinguishable', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'stripe_session_failed' }),
    })
    const user = userEvent.setup()
    render(<PaymentPage />)

    await user.click(screen.getByRole('button', { name: 'paymentCta' }))

    expect(toastMock).toHaveBeenCalledTimes(1)
    const message = (toastMock.mock.calls[0][0] as { description: string }).description
    expect(message).toContain('error') // the translated t('error') string
    expect(message).toContain('stripe_session_failed')
    expect(pushMock).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('when the checkout request throws (offline / dropped connection), tells the customer and re-enables the button instead of leaving it dead', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<PaymentPage />)

    await user.click(screen.getByRole('button', { name: 'paymentCta' }))

    expect(toastMock).toHaveBeenCalled()
    expect((toastMock.mock.calls[0][0] as { description: string }).description).toContain('network')
    expect(screen.getByRole('button', { name: 'paymentCta' })).not.toBeDisabled()
  })

  it('with the owner bypass code applied, marks paid directly and never calls Stripe', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, kind: 'owner_free' }) }) // discount-code check
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'paid' }) }) // mark-paid call
    const user = userEvent.setup()
    render(<PaymentPage />)

    await user.type(screen.getByPlaceholderText('paymentDiscountPlaceholder'), 'NARASIMHA100')
    await user.click(screen.getByRole('button', { name: 'paymentDiscountApply' }))
    await screen.findByRole('button', { name: 'paymentCtaFree' })

    await user.click(screen.getByRole('button', { name: 'paymentCtaFree' }))

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/client/payment',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ report_download_token: 'test-token', discount_code: 'NARASIMHA100' }),
      }),
    )
    expect(pushMock).toHaveBeenCalledWith('/client/upload?token=test-token')
    expect(window.location.href).toBe('')
  })

  it('with a real Stripe promotion code applied, shows the reduced total and still creates a Checkout Session', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, kind: 'stripe_promo', amountOffCents: 1890, percentOff: null }),
      }) // discount-code check: 18.90 off a 19.90 tier -> 1.00 total
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/test-session' }) }) // checkout-session call

    const user = userEvent.setup()
    render(<PaymentPage />)

    await user.type(screen.getByPlaceholderText('paymentDiscountPlaceholder'), 'TESTLIVE1EUR')
    await user.click(screen.getByRole('button', { name: 'paymentDiscountApply' }))
    await screen.findByText('€1.00')

    await user.click(screen.getByRole('button', { name: 'paymentCta' }))

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/client/payment/checkout-session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ report_download_token: 'test-token', discount_code: 'TESTLIVE1EUR' }),
      }),
    )
    expect(window.location.href).toBe('https://checkout.stripe.com/test-session')
  })
})
