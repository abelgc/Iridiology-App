import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/lib/i18n-context'
import { t } from '@/lib/i18n'
import { DoshaQuiz } from '@/components/client/dosha-quiz'
import { DOSHA_QUESTIONS } from '@/lib/dosha/questions'
import { metadata } from '@/app/client/dosha-quiz/page'

function renderQuiz(lang: 'en' | 'es' = 'en') {
  if (lang !== 'en') window.localStorage.setItem('iridology_lang', lang)
  return render(
    <LanguageProvider initialLang={lang}>
      <DoshaQuiz />
    </LanguageProvider>,
  )
}

function option(dosha: 'vata' | 'pitta' | 'kapha') {
  const button = screen.getAllByRole('button').find((el) => el.getAttribute('data-dosha') === dosha)
  if (!button) throw new Error(`missing ${dosha} option`)
  return button
}

describe('dosha quiz', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('opens on the body-frame question and lets Back change the answer', async () => {
    const user = userEvent.setup()
    renderQuiz()

    expect(screen.getByText(/Prakriti/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Question 1 of ${DOSHA_QUESTIONS.length}`))).toBeInTheDocument()
    expect(screen.getByText(/since birth/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: DOSHA_QUESTIONS[0].prompt.en })).toBeInTheDocument()
    expect(screen.getByText('Select the option that feels closest.')).toBeInTheDocument()
    expect(screen.getByText('Body frame')).toBeInTheDocument()
    expect(screen.queryByText('Previous Vikriti results')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()

    await user.click(option('vata'))

    expect(screen.getByText(new RegExp(`Question 2 of ${DOSHA_QUESTIONS.length}`))).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: DOSHA_QUESTIONS[1].prompt.en })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('heading', { name: DOSHA_QUESTIONS[0].prompt.en })).toBeInTheDocument()
    expect(option('vata')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the first question in Spanish when Español is the saved language', () => {
    renderQuiz('es')
    expect(screen.getByRole('heading', { name: DOSHA_QUESTIONS[0].prompt.es })).toBeInTheDocument()
    expect(screen.getByText('Elige la opción que más se acerque.')).toBeInTheDocument()
  })

  it('scores both parts, saves Vikriti history, and can clear it', () => {
    renderQuiz()

    for (let i = 0; i < DOSHA_QUESTIONS.length; i++) fireEvent.click(option('vata'))
    expect(screen.getByText(/Vikriti/)).toBeInTheDocument()
    expect(screen.getByText(/current state/i)).toBeInTheDocument()

    for (let i = 0; i < DOSHA_QUESTIONS.length; i++) fireEvent.click(option('pitta'))

    expect(screen.getByRole('heading', { name: 'Your Ayurvedic Profile' })).toBeInTheDocument()
    expect(screen.getByText(/Pitta is higher now than in your baseline/)).toBeInTheDocument()
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(t('en', 'disclaimer'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explore an iris reading/i })).toHaveAttribute('href', '/')
    expect(screen.getByText('Previous Vikriti results')).toBeInTheDocument()
    expect(screen.getByText('Results stay in this browser only.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear saved quiz data' }))
    expect(screen.getByRole('heading', { name: DOSHA_QUESTIONS[0].prompt.en })).toBeInTheDocument()
    expect(window.localStorage.getItem('narasimha.doshaQuiz')).toBeNull()
  })
})

describe('dosha quiz metadata', () => {
  it('names the quiz in the title and description', () => {
    expect(metadata.title).toEqual({ absolute: 'Dosha Quiz — Narasimha Solutions' })
    expect(metadata.description).toMatch(/Prakriti/)
    expect(metadata.description).toMatch(/wellness reflection/i)
  })
})
