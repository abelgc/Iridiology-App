import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

// Regression test: the practitioner layout must resolve the signed-in user's email itself
// (server-side, where the middleware has already refreshed the session — no browser lock
// involved) and hand it to Header as a prop, instead of leaving Header to fetch it client-side
// on every page mount. See header.test.tsx for the Header half of this fix.

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/practitioner'),
}))

describe('AppLayout (practitioner)', () => {
  it('passes the server-resolved email down to Header', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { email: 'wendy@example.com' } } }),
        },
      }),
    }))
    const { default: FreshAppLayout } = await import('../layout')

    const element = await FreshAppLayout({ children: <div>content</div> })
    render(element)

    expect(screen.getByText('wendy@example.com')).toBeInTheDocument()
    vi.doUnmock('@/lib/supabase/server')
  })

  it('does not crash the page when the server-side user lookup fails', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => {
            throw new Error('network down')
          },
        },
      }),
    }))
    const { default: FreshAppLayout } = await import('../layout')

    const element = await FreshAppLayout({ children: <div>content</div> })
    render(element)

    expect(screen.getByText('content')).toBeInTheDocument()
    vi.doUnmock('@/lib/supabase/server')
  })
})
