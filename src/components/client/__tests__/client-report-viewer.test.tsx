import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n-context'
import { ClientReportViewer } from '@/components/client/client-report-viewer'

const mockReport = {
  section_1_general_terrain: 'Original English content.',
}

function renderViewer() {
  return render(
    <LanguageProvider>
      <ClientReportViewer report={mockReport} isPremium={true} token="test-token" originalLanguage="en" />
    </LanguageProvider>,
  )
}

beforeEach(() => {
  global.fetch = vi.fn()
})

afterEach(() => {
  window.localStorage.removeItem('iridology_lang')
})

describe('ClientReportViewer translation', () => {
  it('does not call the translate endpoint when the header language matches the report language', async () => {
    renderViewer()
    await screen.findByText('Original English content.')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fetches a translation when the header language differs from the report language, and displays it once resolved', async () => {
    window.localStorage.setItem('iridology_lang', 'es')
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: { section_1_general_terrain: 'Contenido traducido.' } }),
    })

    renderViewer()

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/client/reports/test-token/translate',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ lang: 'es' }) }),
      ),
    )
    await waitFor(() => expect(screen.getByText('Contenido traducido.')).toBeInTheDocument())
  })

  it('keeps showing the original content and shows an error notice when the translate fetch fails', async () => {
    window.localStorage.setItem('iridology_lang', 'es')
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false })

    renderViewer()

    await waitFor(() => expect(screen.getByText(/no pudimos traducir/i)).toBeInTheDocument())
    expect(screen.getByText('Original English content.')).toBeInTheDocument()
  })

  it('does not refetch a language it has already successfully translated', async () => {
    window.localStorage.setItem('iridology_lang', 'es')
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: { section_1_general_terrain: 'Contenido traducido.' } }),
    })

    const { rerender } = renderViewer()
    await waitFor(() => expect(screen.getByText('Contenido traducido.')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledTimes(1)

    rerender(
      <LanguageProvider>
        <ClientReportViewer report={mockReport} isPremium={true} token="test-token" originalLanguage="en" />
      </LanguageProvider>,
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
