import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'

const listPromotionCodesMock = vi.fn()

vi.mock('@/lib/stripe/server', () => ({
  getStripeClient: () => ({
    promotionCodes: { list: listPromotionCodesMock },
  }),
}))

function makeRequest(code: string) {
  return new NextRequest('http://test.example/api/client/payment/discount-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

const ORIGINAL_ENV = process.env.OWNER_TEST_DISCOUNT_CODE

beforeEach(() => {
  listPromotionCodesMock.mockReset()
  process.env.OWNER_TEST_DISCOUNT_CODE = 'NARASIMHA100'
})

afterAll(() => {
  process.env.OWNER_TEST_DISCOUNT_CODE = ORIGINAL_ENV
})

describe('POST /api/client/payment/discount-code', () => {
  it('recognizes the owner bypass code without calling Stripe', async () => {
    const { POST } = await import('@/app/api/client/payment/discount-code/route')
    const res = await POST(makeRequest('narasimha100'))
    const json = await res.json()

    expect(json).toEqual({ valid: true, kind: 'owner_free' })
    expect(listPromotionCodesMock).not.toHaveBeenCalled()
  })

  it('validates a real Stripe promotion code and returns its discount amount', async () => {
    listPromotionCodesMock.mockResolvedValue({
      data: [{ id: 'promo_123', promotion: { coupon: { amount_off: 1890, percent_off: null } } }],
    })

    const { POST } = await import('@/app/api/client/payment/discount-code/route')
    const res = await POST(makeRequest('TESTLIVE1EUR'))
    const json = await res.json()

    expect(json).toEqual({ valid: true, kind: 'stripe_promo', amountOffCents: 1890, percentOff: null })
    expect(listPromotionCodesMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TESTLIVE1EUR', active: true }),
    )
  })

  it('rejects a code that matches neither the owner code nor an active Stripe promotion code', async () => {
    listPromotionCodesMock.mockResolvedValue({ data: [] })

    const { POST } = await import('@/app/api/client/payment/discount-code/route')
    const res = await POST(makeRequest('MADEUPCODE'))
    const json = await res.json()

    expect(json).toEqual({ valid: false })
  })

  it('fails closed (invalid) when the Stripe lookup itself errors', async () => {
    listPromotionCodesMock.mockRejectedValue(new Error('stripe down'))

    const { POST } = await import('@/app/api/client/payment/discount-code/route')
    const res = await POST(makeRequest('ANYCODE'))
    const json = await res.json()

    expect(json).toEqual({ valid: false })
  })

  it('returns invalid for an empty code', async () => {
    const { POST } = await import('@/app/api/client/payment/discount-code/route')
    const res = await POST(makeRequest(''))
    const json = await res.json()

    expect(json).toEqual({ valid: false })
    expect(listPromotionCodesMock).not.toHaveBeenCalled()
  })
})
