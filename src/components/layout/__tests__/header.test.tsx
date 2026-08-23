import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { Header } from '../header'
import { SidebarProvider } from '../sidebar-provider'

// Regression test for the /practitioner Navigator Lock race: Header used to fetch the signed-in
// user itself (supabase.auth.getUser() in a mount effect), racing every other Supabase call that
// fires when a practitioner page mounts (see header.tsx history / a6e4abd's app_errors table for
// the "Lock ... was released because another request stole it" failures this caused in
// production). The fix makes the practitioner layout resolve the email server-side (already
// authenticated by middleware, no lock contention there) and pass it down as a prop, so Header
// never touches the browser Supabase client on mount at all.

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

describe('Header', () => {
  it('shows the signed-in practitioner email synchronously, with no async round trip', () => {
    render(
      <SidebarProvider>
        <Header userEmail="wendy@example.com" />
      </SidebarProvider>,
    )

    // No waitFor: if Header still had to fetch the user itself, this text would not exist yet
    // on the very first synchronous render.
    expect(screen.getByText('wendy@example.com')).toBeInTheDocument()
  })

  it('renders nothing where the email goes when there is no session yet', () => {
    render(
      <SidebarProvider>
        <Header userEmail="" />
      </SidebarProvider>,
    )

    expect(screen.queryByText('@')).not.toBeInTheDocument()
  })
})
