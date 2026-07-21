import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LanguageProvider } from '@/lib/i18n-context'
import { LanguageToggle } from '@/components/client/language-toggle'
import ClientReportPage from '../page'

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ token: 'test-token' })),
}))

vi.mock('@/components/client/analysis-splash', () => ({
  AnalysisSplash: () => <div data-testid="analysis-splash" />,
}))

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/client/reports/test-token' && !init) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          language: 'en',
          report: { section_1_general_terrain: 'Original English content.' },
          paymentTier: 'basic_12',
          deliveredAt: null,
        }),
      })
    }
    if (url === '/api/client/reports/test-token/translate' && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ content: { section_1_general_terrain: 'Contenido en español.' } }),
      })
    }
    throw new Error(`Unexpected fetch: ${url} ${JSON.stringify(init)}`)
  })
}

describe('REGRESSION: client report language toggle actually sticks', () => {
  beforeEach(() => {
    window.localStorage.removeItem('iridology_lang')
    global.fetch = mockFetch() as unknown as typeof fetch
  })

  afterEach(() => {
    window.localStorage.removeItem('iridology_lang')
  })

  it('keeps showing translated content after toggling — does not silently snap back to the original language', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="en">
        <LanguageToggle />
        <ClientReportPage />
      </LanguageProvider>,
    )

    await screen.findByText('Original English content.')

    await user.click(screen.getByRole('button', { name: /español/i }))

    await waitFor(() => expect(screen.getByText('Contenido en español.')).toBeInTheDocument())

    // Give any stray effect (e.g. the report-fetch effect re-firing because
    // setLang's identity changed) a chance to revert the language back before
    // asserting the translation actually stuck.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.getByText('Contenido en español.')).toBeInTheDocument()
    expect(screen.queryByText('Original English content.')).not.toBeInTheDocument()
  })
})
