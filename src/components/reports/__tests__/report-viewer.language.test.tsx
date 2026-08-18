import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, waitForElementToBeRemoved } from '@testing-library/react'
import { NextRequest } from 'next/server'
import { ReportViewer } from '../report-viewer'
import type { Report } from '@/types/database'

const REPORT_ID = 'report-lang-1'

// In-memory stand-in for the `reports` row, used only by the data-layer
// describe block below. Declared at module scope because vi.mock is hoisted
// above everything else in this file.
let currentRow: Record<string, unknown>

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: currentRow, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: () => {
              currentRow = { ...currentRow, ...payload }
              return Promise.resolve({ data: currentRow, error: null })
            },
          }),
        }),
      }),
    }),
  }),
}))

// The report was generated natively in English (this is the pipeline default —
// see `language: string = 'en'` in src/lib/claude/analyze.ts). The practitioner's
// working language for this report is Spanish, produced through the report
// viewer's own ES/DE "view in another language" feature
// (src/app/api/translate/route.ts), since reports have no persisted language
// field anywhere to record that intent.
const NATIVE_CONTENT = {
  section_1_general_terrain: 'General terrain text.',
  section_2_emotional_field: 'Emotional field text.',
  section_3_cognitive_nervous: 'Cognitive and nervous text.',
}

const SPANISH_TRANSLATION = {
  section_1_general_terrain: 'Texto de terreno general en español.',
  section_2_emotional_field: 'Texto de campo emocional en español.',
  section_3_cognitive_nervous: 'Texto cognitivo y nervioso en español.',
}

const GERMAN_TRANSLATION = {
  section_1_general_terrain: 'Allgemeiner Terraintext.',
  section_2_emotional_field: 'Emotionaler Feldtext.',
  section_3_cognitive_nervous: 'Kognitiver und nervöser Text.',
}

function makeReport(): Report {
  return {
    id: REPORT_ID,
    session_id: 'session-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    report_content: { ...NATIVE_CONTENT },
    report_version: 1,
    is_edited: false,
  }
}

describe('ReportViewer — render layer (component test, no persistence involved)', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const href = String(url)

      if (href === '/api/translate' && init?.method === 'POST') {
        const { targetLang } = JSON.parse(init.body as string)
        const content = targetLang === 'de' ? GERMAN_TRANSLATION : SPANISH_TRANSLATION
        return { ok: true, status: 200, json: async () => ({ content }) } as Response
      }

      if (href === `/api/reports/${REPORT_ID}` && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string)
        return { ok: true, status: 200, json: async () => ({ id: REPORT_ID, ...body }) } as Response
      }

      throw new Error(`Unexpected fetch: ${href}`)
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function switchToSpanish() {
    fireEvent.click(screen.getByRole('button', { name: /^es$/i }))
    await waitFor(() =>
      expect(screen.getByText(SPANISH_TRANSLATION.section_2_emotional_field)).toBeInTheDocument(),
    )
  }

  async function editSection(index: number, newText: string) {
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[index])
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: newText } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitForElementToBeRemoved(textarea)
  }

  it('[case 1] keeps every untouched section in Spanish after editing and saving one section', async () => {
    render(<ReportViewer report={makeReport()} />)
    await switchToSpanish()

    await editSection(0, 'Texto de terreno general en español, editado.')

    // Sections 2 and 3 were never touched — they should still read in Spanish.
    expect(screen.getByText(SPANISH_TRANSLATION.section_2_emotional_field)).toBeInTheDocument()
    expect(screen.getByText(SPANISH_TRANSLATION.section_3_cognitive_nervous)).toBeInTheDocument()
  })

  it('[case 2] shows the freshly edited text for the section just saved, not a stale cached translation', async () => {
    render(<ReportViewer report={makeReport()} />)
    await switchToSpanish()

    await editSection(0, 'Texto de terreno general en español, editado.')

    expect(screen.getByText('Texto de terreno general en español, editado.')).toBeInTheDocument()
    expect(screen.queryByText(SPANISH_TRANSLATION.section_1_general_terrain)).not.toBeInTheDocument()
  })

  it('[case 3] survives two sequential edits: the still-untouched section keeps its language after both saves', async () => {
    render(<ReportViewer report={makeReport()} />)
    await switchToSpanish()

    await editSection(0, 'Texto de terreno general en español, editado.')
    await editSection(1, 'Texto de campo emocional en español, editado.')

    // Section 3 was never touched by either save.
    expect(screen.getByText(SPANISH_TRANSLATION.section_3_cognitive_nervous)).toBeInTheDocument()
    // Both edited sections show their own fresh text.
    expect(screen.getByText('Texto de terreno general en español, editado.')).toBeInTheDocument()
    expect(screen.getByText('Texto de campo emocional en español, editado.')).toBeInTheDocument()
  })

  it('[case 4] keeps the German cache intact after an edit made while viewing German, independent of Spanish', async () => {
    render(<ReportViewer report={makeReport()} />)
    await switchToSpanish()

    // Pre-warm the German cache too (a practitioner who has looked at both).
    fireEvent.click(screen.getByRole('button', { name: /^de$/i }))
    await waitFor(() =>
      expect(screen.getByText(GERMAN_TRANSLATION.section_2_emotional_field)).toBeInTheDocument(),
    )

    await editSection(0, 'Allgemeiner Terraintext, bearbeitet.')

    // Section 2, untouched, must still read in German (current working language).
    expect(screen.getByText(GERMAN_TRANSLATION.section_2_emotional_field)).toBeInTheDocument()

    // Switching back to Spanish must not have been corrupted by the German-context edit.
    fireEvent.click(screen.getByRole('button', { name: /^es$/i }))
    await waitFor(() =>
      expect(screen.getByText(SPANISH_TRANSLATION.section_2_emotional_field)).toBeInTheDocument(),
    )
    expect(screen.getByText(SPANISH_TRANSLATION.section_3_cognitive_nervous)).toBeInTheDocument()
  })
})

describe('reports/[id] route — data layer (no component involved)', () => {
  beforeEach(() => {
    currentRow = { id: REPORT_ID, report_content: { ...NATIVE_CONTENT }, is_edited: false }
  })

  it('preserves the untouched section verbatim when only one section is edited', async () => {
    const { PUT, GET } = await import('@/app/api/reports/[id]/route')

    const editedContent = {
      ...NATIVE_CONTENT,
      section_1_general_terrain: 'General terrain text, edited.',
    }

    const putReq = new NextRequest(`http://test.example/api/reports/${REPORT_ID}`, {
      method: 'PUT',
      body: JSON.stringify({ report_content: editedContent }),
      headers: { 'Content-Type': 'application/json' },
    })
    await PUT(putReq, { params: Promise.resolve({ id: REPORT_ID }) })

    const getReq = new NextRequest(`http://test.example/api/reports/${REPORT_ID}`)
    const getRes = await GET(getReq, { params: Promise.resolve({ id: REPORT_ID }) })
    const persisted = await getRes.json()

    expect(persisted.report_content.section_2_emotional_field).toBe(
      NATIVE_CONTENT.section_2_emotional_field,
    )
  })
})
