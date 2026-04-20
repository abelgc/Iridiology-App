import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n-context'
import { IrisImageUpload } from '@/components/client/iris-image-upload'

describe('IrisImageUpload', () => {
  it('renders two upload zones (right and left)', () => {
    render(
      <LanguageProvider initialLang="en">
        <IrisImageUpload onSubmit={vi.fn()} />
      </LanguageProvider>,
    )
    expect(screen.getByText(/right eye/i)).toBeInTheDocument()
    expect(screen.getByText(/left eye/i)).toBeInTheDocument()
  })

  it('keeps the submit button disabled until both eyes are provided', () => {
    render(
      <LanguageProvider initialLang="en">
        <IrisImageUpload onSubmit={vi.fn()} />
      </LanguageProvider>,
    )
    expect(screen.getByRole('button', { name: /submit|continue/i })).toBeDisabled()
  })
})
