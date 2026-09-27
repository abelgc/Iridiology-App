import { describe, it, expect, vi, beforeEach } from 'vitest'

let waitUntilPromise: Promise<unknown> | null = null
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromise = p
  },
}))

const mockAnalyze = vi.fn()
vi.mock('@/lib/claude/analyze-dual', () => ({
  analyzeIrisDual: (...args: unknown[]) => mockAnalyze(...args),
}))

const mockShouldJyotish = vi.fn().mockReturnValue(false)
const mockEnhance = vi.fn()
vi.mock('@/lib/claude/enhance-emotional-field', () => ({
  shouldEnhanceWithJyotish: (...args: unknown[]) => mockShouldJyotish(...args),
  enhanceEmotionalFieldWithJyotish: (...args: unknown[]) => mockEnhance(...args),
}))

function chain(finalResult: any): any {
  const c: any = {
    eq: () => c,
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}

const updateMock = vi.fn()
const insertMock = vi.fn()
let updateResolves: any = { data: { status: 'analyzing' }, error: null }
let patientNotes: string | null = 'uric acid in kidneys, shoe lacunae'

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'sessions') {
        return {
          insert: (row: unknown) => {
            insertMock(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'session-1' }, error: null }) }) }
          },
          update: (...args: unknown[]) => {
            updateMock(...args)
            return chain(updateResolves)
          },
        }
      }
      if (table === 'patients') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { notes: patientNotes }, error: null }),
            }),
          }),
        }
      }
      if (table === 'reports') {
        return { insert: () => Promise.resolve({ data: null, error: null }) }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

import { POST } from '../route'

function makeRequest(patientData: Record<string, unknown> = {}, language?: string) {
  return new Request('http://test', {
    method: 'POST',
    body: JSON.stringify({
      patientId: 'p1',
      rightIrisBase64: 'a',
      leftIrisBase64: 'b',
      patientData: { symptoms: '', practitioner_notes: '', ...patientData },
      ...(language ? { language } : {}),
    }),
  }) as never
}

describe('POST /api/analyze', () => {
  beforeEach(() => {
    waitUntilPromise = null
    updateMock.mockClear()
    insertMock.mockClear()
    patientNotes = 'uric acid in kidneys, shoe lacunae'
    mockAnalyze.mockReset()
    mockShouldJyotish.mockReset().mockReturnValue(false)
    mockEnhance.mockReset()
    updateResolves = { data: { status: 'analyzing' }, error: null }
  })

  it('completes normally, guarding the terminal write with status=analyzing', async () => {
    mockAnalyze.mockResolvedValue({ section_1_general_terrain: 'x' })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await waitUntilPromise

    const completedCall = updateMock.mock.calls.find(([arg]) => arg.status === 'completed')
    expect(completedCall).toBeTruthy()
  })

  it('does not fail the session when Jyotish enhancement rejects — keeps the unenhanced report', async () => {
    mockAnalyze.mockResolvedValue({ section_1_general_terrain: 'x' })
    mockShouldJyotish.mockReturnValue(true)
    mockEnhance.mockRejectedValue(new Error('jyotish boom'))
    const res = await POST(makeRequest({
      date_of_birth: '1990-01-01',
      country_of_birth: 'ES',
      city_of_birth: 'Madrid',
      time_of_day: 'morning',
      full_name: 'Jane',
    }))
    expect(res.status).toBe(200)
    await waitUntilPromise

    expect(updateMock.mock.calls.find(([arg]) => arg.status === 'completed')).toBeTruthy()
    expect(updateMock.mock.calls.find(([arg]) => arg.status === 'error')).toBeFalsy()
  })

  it('is a silent no-op when the terminal CAS finds 0 rows (status already settled)', async () => {
    mockAnalyze.mockResolvedValue({ section_1_general_terrain: 'x' })
    updateResolves = { data: null, error: null } // simulate losing the CAS race
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await expect(waitUntilPromise).resolves.toBeUndefined()
  })

  it('writes an error status (guarded) when analyzeIrisDual returns an error code', async () => {
    mockAnalyze.mockResolvedValue({ code: 'BOOM', message: 'bad' })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await waitUntilPromise

    expect(updateMock.mock.calls.find(([arg]) => arg.status === 'error')).toBeTruthy()
  })

  describe('REGRESSION (Maike Kedher report, 2026-09-21): report language selection', () => {
    it('passes the selected language through to analyzeIrisDual with forceLanguage, instead of always defaulting to English', async () => {
      mockAnalyze.mockResolvedValue({ section_1_general_terrain: 'x' })
      const res = await POST(makeRequest({}, 'es'))
      expect(res.status).toBe(200)
      await waitUntilPromise

      expect(mockAnalyze).toHaveBeenCalledTimes(1)
      const [, language, options] = mockAnalyze.mock.calls[0]
      expect(language).toBe('es')
      expect(options).toEqual({ forceLanguage: true })
    })

    it('defaults to English with forceLanguage when no language is selected', async () => {
      mockAnalyze.mockResolvedValue({ section_1_general_terrain: 'x' })
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      await waitUntilPromise

      const [, language, options] = mockAnalyze.mock.calls[0]
      expect(language).toBe('en')
      expect(options).toEqual({ forceLanguage: true })
    })

    it('REGRESSION (Vidya Dasi Poland, 2026-09-27): empty session notes still reach the model from the patient record', async () => {
      mockAnalyze.mockResolvedValue({ section_1_general_terrain: 'x' })
      const res = await POST(makeRequest({ practitioner_notes: '' }))
      expect(res.status).toBe(200)
      await waitUntilPromise

      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        practitioner_notes: 'uric acid in kidneys, shoe lacunae',
      }))
      expect(mockAnalyze.mock.calls[0][0].patientData.practitioner_notes).toBe('uric acid in kidneys, shoe lacunae')
    })

    it('keeps notes typed on the session when they differ from the patient record', async () => {
      mockAnalyze.mockResolvedValue({ section_1_general_terrain: 'x' })
      const res = await POST(makeRequest({ practitioner_notes: 'look again at the liver only' }))
      expect(res.status).toBe(200)
      await waitUntilPromise

      expect(mockAnalyze.mock.calls[0][0].patientData.practitioner_notes).toBe('look again at the liver only')
    })

    it('falls back to English for an unsupported language value instead of passing it through unchecked', async () => {
      mockAnalyze.mockResolvedValue({ section_1_general_terrain: 'x' })
      const res = await POST(makeRequest({}, 'fr'))
      expect(res.status).toBe(200)
      await waitUntilPromise

      const [, language] = mockAnalyze.mock.calls[0]
      expect(language).toBe('en')
    })
  })
})
