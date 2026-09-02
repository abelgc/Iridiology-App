import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

// REGRESSION (2026-09-02): the dashboard's "Recent Sessions" query embedded
// patients(name) — but the patients table has no "name" column, only
// "full_name" (confirmed against the live schema). PostgREST rejects a
// request for a nonexistent embedded column, so this always errored and the
// practitioner only ever saw "Unable to load sessions". This mock reproduces
// that real PostgREST behavior: it only succeeds when the select string asks
// for patients(full_name).
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'patients') {
        return { select: () => Promise.resolve({ count: 3 }) }
      }
      if (table === 'sessions') {
        return {
          select: (cols: string) => ({
            order: () => ({
              limit: () =>
                cols.includes('patients(full_name)')
                  ? Promise.resolve({
                      data: [
                        {
                          id: 's1',
                          patient_id: 'p1',
                          created_at: '2026-01-01T00:00:00Z',
                          patients: { full_name: 'Jane Doe' },
                        },
                      ],
                      error: null,
                    })
                  : Promise.resolve({
                      data: null,
                      error: { message: 'column patients.name does not exist' },
                    }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

describe('DashboardPage — Recent Sessions', () => {
  it('loads and displays recent sessions instead of "Unable to load sessions"', async () => {
    const { default: DashboardPage } = await import('../page')
    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())

    expect(screen.queryByText('Unable to load sessions')).not.toBeInTheDocument()
  })
})
