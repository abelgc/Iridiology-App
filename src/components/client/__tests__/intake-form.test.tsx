import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider, useLanguage } from '@/lib/i18n-context'
import { IntakeForm } from '@/components/client/intake-form'

describe('IntakeForm', () => {
  it('shows validation errors when submitted empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="en">
        <IntakeForm tier="basic_1990" onSubmit={onSubmit} />
      </LanguageProvider>,
    )
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
    expect(await screen.findByText(/highlighted fields/i)).toBeInTheDocument()
  })

  it('submits valid data', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="en">
        <IntakeForm tier="basic_1990" onSubmit={onSubmit} />
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

  it('submits valid data when language context is german', async () => {
    window.localStorage.setItem('iridology_lang', 'de')
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <LanguageProvider initialLang="de">
        <IntakeForm tier="basic_1990" onSubmit={onSubmit} />
      </LanguageProvider>,
    )
    // Query by name/type instead of label text: labels render in German here, so
    // English regexes (used by the other tests above) would never match.
    const byName = (name: string) => container.querySelector(`[name="${name}"]`) as HTMLElement
    await user.type(byName('full_name'), 'Jane Doe')
    await user.type(byName('email'), 'jane@example.com')
    await user.type(byName('main_complaint'), 'Fatigue')
    await user.type(byName('symptom_duration'), '6 months')
    await user.type(byName('date_of_birth'), '1990-05-12')
    await user.type(byName('country_of_birth'), 'Mexico')
    await user.type(byName('city_of_birth'), 'Mexico City')
    await user.click(container.querySelector('input[name="time_of_day"][value="morning"]') as HTMLElement)
    await user.click(container.querySelector('button[type="submit"]') as HTMLElement)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ language: 'de' })
    window.localStorage.removeItem('iridology_lang')
  })

  it('REGRESSION (2026-07-20 production incident): submits the language actually shown on screen, not the one the form mounted with', async () => {
    // Reproduces the reported failure: a client had the header toggle on Spanish, but the
    // submitted intake row ended up with language 'en'. The hidden "language" field used to
    // mix register() with a raw value={lang} prop, which only tracks `lang` as of first
    // render — defaultValues.language is captured once at mount and never revisited. This
    // renders the form starting in English (like the real flow does) and switches language
    // via the same context the header toggle uses, without remounting the form, then checks
    // the submitted payload reflects the switch.
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    function Harness() {
      const { setLang } = useLanguage()
      return (
        <>
          <button type="button" onClick={() => setLang('es')}>switch-to-es</button>
          <IntakeForm tier="basic_1990" onSubmit={onSubmit} />
        </>
      )
    }

    const { container } = render(
      <LanguageProvider initialLang="en">
        <Harness />
      </LanguageProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'switch-to-es' }))

    const byName = (name: string) => container.querySelector(`[name="${name}"]`) as HTMLElement
    await user.type(byName('full_name'), 'Jane Doe')
    await user.type(byName('email'), 'jane@example.com')
    await user.type(byName('main_complaint'), 'Fatigue')
    await user.type(byName('symptom_duration'), '6 months')
    await user.type(byName('date_of_birth'), '1990-05-12')
    await user.type(byName('country_of_birth'), 'Mexico')
    await user.type(byName('city_of_birth'), 'Mexico City')
    await user.click(container.querySelector('input[name="time_of_day"][value="morning"]') as HTMLElement)
    await user.click(container.querySelector('button[type="submit"]') as HTMLElement)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ language: 'es' })
  })
})
