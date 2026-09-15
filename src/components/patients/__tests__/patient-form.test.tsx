import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatientForm } from '../patient-form'

describe('PatientForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all required fields', () => {
    const mockOnSubmit = vi.fn()
    render(<PatientForm onSubmit={mockOnSubmit} />)

    expect(screen.getByPlaceholderText('Patient name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('patient@example.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Phone number')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Patient medical history')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Additional notes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create patient/i })).toBeInTheDocument()
  })

  it('shows validation error when submitting with empty name', async () => {
    const mockOnSubmit = vi.fn()
    render(<PatientForm onSubmit={mockOnSubmit} />)

    const submitButton = screen.getByRole('button', { name: /create patient/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument()
    })

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('does not submit form with invalid email', async () => {
    const mockOnSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PatientForm onSubmit={mockOnSubmit} />)

    const nameInput = screen.getByPlaceholderText('Patient name') as HTMLInputElement
    const emailInput = screen.getByPlaceholderText('patient@example.com') as HTMLInputElement

    await user.type(nameInput, 'John Doe')
    await user.type(emailInput, 'invalid-email')

    const submitButton = screen.getByRole('button', { name: /create patient/i })
    await user.click(submitButton)

    // The form should not call onSubmit if validation fails
    await waitFor(() => {
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })
  })

  it("REGRESSION (Ana Iranzo date-of-birth bug, 2026-09-15): date of birth is chosen from a real calendar, not free-typed — a malformed year like '0193' can no longer be entered because there is no text field to type it into", async () => {
    const mockOnSubmit = vi.fn()
    const user = userEvent.setup()
    render(<PatientForm onSubmit={mockOnSubmit} />)

    // No native date/text input exists for date of birth any more.
    expect(screen.queryByPlaceholderText(/date of birth/i)).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Patient name'), 'Jane Doe')

    const dateTrigger = screen.getByRole('button', { name: /select date of birth/i })
    await user.click(dateTrigger)

    const dayButton = await screen.findByRole('button', { name: /15/ })
    await user.click(dayButton)

    // The trigger now shows a real formatted date instead of the placeholder.
    expect(screen.queryByText(/select date of birth/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /create patient/i }))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    })

    const submitted = mockOnSubmit.mock.calls[0][0]
    // A real, fully-qualified ISO date — never a truncated/garbled year.
    expect(submitted.date_of_birth).toMatch(/^\d{4}-\d{2}-15$/)
  })
})
