import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import LoginPage from '../page'

// Mock the Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(),
    },
  })),
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email and password input fields', () => {
    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText('your@email.com')
    const passwordInput = screen.getByPlaceholderText('••••••')

    expect(emailInput).toBeInTheDocument()
    expect(passwordInput).toBeInTheDocument()
  })

  it('has proper form structure with email and password fields', () => {
    render(<LoginPage />)

    const emailInput = screen.getByPlaceholderText('your@email.com')
    const passwordInput = screen.getByPlaceholderText('••••••')
    const emailLabel = screen.getByText('Email')
    const passwordLabel = screen.getByText('Password')

    expect(emailInput).toHaveAttribute('type', 'email')
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(emailLabel).toBeInTheDocument()
    expect(passwordLabel).toBeInTheDocument()
  })

  it('shows validation error when password is too short', async () => {
    render(<LoginPage />)

    const passwordInput = screen.getByPlaceholderText('••••••') as HTMLInputElement
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(passwordInput, { target: { value: '123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument()
    })
  })
})
