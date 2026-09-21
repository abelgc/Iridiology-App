import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { SessionForm } from '../session-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// The "Report Language" <label> isn't programmatically associated with its <select> (no
// htmlFor/id — matches this component's existing pattern for every other field, e.g.
// "Session Date"), so it isn't reachable via getByLabelText. Locate it structurally instead.
function getLanguageSelect(): HTMLSelectElement | null {
  const label = screen.queryByText('Report Language')
  return label?.parentElement?.querySelector('select') ?? null
}

describe('SessionForm — language selector (added 2026-09-21)', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: unknown) => {
      const href = String(url)
      if (href === '/api/patients') {
        return { ok: true, json: async () => [{ id: 'p1', full_name: 'Jane Doe' }] } as Response
      }
      throw new Error(`Unexpected fetch: ${href}`)
    }) as unknown as typeof fetch
  })

  it('shows the language selector for standard mode, defaulted to English', async () => {
    render(<SessionForm />)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    const select = getLanguageSelect()
    expect(select).not.toBeNull()
    expect(select!.value).toBe('en')
  })

  it('hides the language selector for comparison mode (not wired to that endpoint yet)', async () => {
    render(<SessionForm />)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Comparison'))
    expect(getLanguageSelect()).toBeNull()
  })

  it('hides the language selector for technical review mode', async () => {
    render(<SessionForm />)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Technical Review'))
    expect(getLanguageSelect()).toBeNull()
  })

  it('lets the practitioner pick Spanish or German', async () => {
    render(<SessionForm />)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    const select = getLanguageSelect()!
    fireEvent.change(select, { target: { value: 'es' } })
    expect(select.value).toBe('es')
  })
})
