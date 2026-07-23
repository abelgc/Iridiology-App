import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentPage from '../page'

const pushMock = vi.fn()
const replaceMock = vi.fn()
let searchParamValues: Record<string, string> = { token: 'test-token', tier: 'basic_1990' }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => ({ get: (key: string) => searchParamValues[key] ?? null }),
}))

vi.mock('@/lib/i18n-context', () => ({
  useLanguage: () => ({ t: (key: string) => key, lang: 'en' }),
}))

describe('PaymentPage', () => {
  beforeEach(() => {
    pushMock.mockClear()
    replaceMock.mockClear()
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

  it('with a discount code applied, marks paid directly and never calls Stripe', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true }) }) // discount-code check
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
})
