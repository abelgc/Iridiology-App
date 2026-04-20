import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/lib/i18n-context'
import { LanguageToggle } from '@/components/client/language-toggle'

function renderWithLang(initial: 'en' | 'es') {
  return render(
    <LanguageProvider initialLang={initial}>
      <LanguageToggle />
    </LanguageProvider>,
  )
}

describe('LanguageToggle', () => {
  it('renders both flags', () => {
    renderWithLang('en')
    expect(screen.getByRole('button', { name: /english/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /español/i })).toBeInTheDocument()
  })

  it('switches language on click', async () => {
    const user = userEvent.setup()
    renderWithLang('en')
    await user.click(screen.getByRole('button', { name: /español/i }))
    // Active language exposes aria-pressed=true on the active button
    expect(screen.getByRole('button', { name: /español/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
