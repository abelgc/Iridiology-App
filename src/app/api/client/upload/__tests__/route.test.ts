import { describe, it, expect, vi, beforeEach } from 'vitest'

const analysisRow = {
  id: 'a1',
  status: 'paid',
  language: 'es',
  payment_tier: 'basic_12',
  email: 'jane@example.com',
  date_of_birth: '1990-05-12',
  country_of_birth: 'Mexico',
  city_of_birth: 'Mexico City',
  time_of_day: 'morning',
  main_complaint: 'Fatigue',
  symptom_duration: '6 months',
  current_medications: '',
  report_download_token: '00000000-0000-4000-8000-000000000000',
}

const mockReport = {
  section_1_general_terrain: 'g',
  section_2_emotional_field: 'e',
  section_3_cognitive_nervous: 'n',
  section_4_immune_lymphatic: 'i',
  section_5_endocrine_hormonal: 'h',
  section_6_circulatory_cardiorespiratory: 'c',
  section_7_hepatic: 'l',
  section_8_digestive_intestinal: 'd',
  section_9_renal_urinary: 'r',
  section_10_structural_integumentary: 's',
  section_11_detected_axes: 'a',
  section_12_conclusion: 'C',
}

const selectSingle = vi.fn().mockResolvedValue({ data: analysisRow, error: null })
const updateMock = vi.fn().mockResolvedValue({ data: null, error: null })
const insertReport = vi.fn().mockResolvedValue({
  data: { id: 'r1' },
  error: null,
})

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'client_analyses') {
        return {
          select: () => ({
            eq: () => ({ single: selectSingle }),
          }),
          update: (...args: unknown[]) => {
            updateMock(...args)
            return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }
          },
        }
      }
      if (table === 'reports') {
        return {
          insert: () => ({ select: () => ({ single: insertReport }) }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

vi.mock('@/lib/claude/analyze-dual', () => ({
  analyzeIrisDual: vi.fn().mockResolvedValue(mockReport),
}))

vi.mock('@/lib/ai/get-provider', () => ({
  getClientProviders: vi.fn().mockResolvedValue({
    anthropic: {},
    openai: {},
  }),
}))

vi.mock('@/app/api/client/upload/language-check', () => ({
  detectsCorrectLanguage: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/claude/enhance-emotional-field', () => ({
  shouldEnhanceWithJyotish: () => false,
  enhanceEmotionalFieldWithJyotish: vi.fn(async (r: unknown) => r),
}))

vi.mock('@/lib/client/writing-pipeline', () => ({
  rewriteReportForClient: vi.fn().mockResolvedValue(mockReport),
}))

vi.mock('@/lib/client/pdf', () => ({
  generateReportPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
}))

vi.mock('@/lib/client/email', () => ({
  sendReportEmail: vi.fn().mockResolvedValue({ ok: true, id: 'mail-1' }),
}))

beforeEach(() => {
  selectSingle.mockClear()
  updateMock.mockClear()
  insertReport.mockClear()
})

describe('POST /api/client/upload', () => {
  it('runs analysis, stores report, and returns the token', async () => {
    const { POST } = await import('@/app/api/client/upload/route')
    const req = new Request('http://test/api/client/upload', {
      method: 'POST',
      body: JSON.stringify({
        report_download_token: '00000000-0000-4000-8000-000000000000',
        right_eye_base64: 'data:image/jpeg;base64,AAA',
        left_eye_base64: 'data:image/jpeg;base64,BBB',
      }),
    })
    const res = await POST(req as never)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.report_download_token).toBe('00000000-0000-4000-8000-000000000000')
    expect(insertReport).toHaveBeenCalledTimes(1)
  })

  it('refuses unpaid analyses', async () => {
    selectSingle.mockResolvedValueOnce({
      data: { ...analysisRow, status: 'intake_pending' },
      error: null,
    })
    const { POST } = await import('@/app/api/client/upload/route')
    const req = new Request('http://test/api/client/upload', {
      method: 'POST',
      body: JSON.stringify({
        report_download_token: '00000000-0000-4000-8000-000000000000',
        right_eye_base64: 'data:image/jpeg;base64,AAA',
        left_eye_base64: 'data:image/jpeg;base64,BBB',
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(402)
  })
})
