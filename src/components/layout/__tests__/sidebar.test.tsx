import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { Sidebar } from '../sidebar'
import { SidebarProvider } from '../sidebar-provider'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

describe('Sidebar', () => {
  it('renders all navigation links', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    )

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Patients')).toBeInTheDocument()
    expect(screen.getByText('New Session')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders navigation links with correct hrefs', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    )

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
    const patientsLink = screen.getByRole('link', { name: /patients/i })
    const newSessionLink = screen.getByRole('link', { name: /new session/i })

    expect(dashboardLink).toHaveAttribute('href', '/')
    expect(patientsLink).toHaveAttribute('href', '/patients')
    expect(newSessionLink).toHaveAttribute('href', '/sessions/new')
  })

  it('renders dashboard link with home href', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    )

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
    expect(dashboardLink).toHaveAttribute('href', '/')
  })
})
