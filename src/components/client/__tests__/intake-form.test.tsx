import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/lib/i18n-context'
import { IntakeForm } from '@/components/client/intake-form'

describe('IntakeForm', () => {
  it('shows validation errors when submitted empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="en">
        <IntakeForm tier="basic_12" onSubmit={onSubmit} />
      </LanguageProvider>,
    )
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
  })

  it('submits valid data', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="en">
        <IntakeForm tier="basic_12" onSubmit={onSubmit} />
      </LanguageProvider>,
    )
    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/main health concern/i), 'Fatigue')
    await user.type(screen.getByLabelText(/how long/i), '6 months')
    await user.type(screen.getByLabelText(/date of birth/i), '1990-05-12')
    await user.type(screen.getByLabelText(/country of birth/i), 'Mexico')
    await user.type(screen.getByLabelText(/city of birth/i), 'Mexico City')
    await user.click(screen.getByLabelText(/morning/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
