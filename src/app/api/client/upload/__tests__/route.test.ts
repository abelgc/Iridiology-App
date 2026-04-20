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
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

vi.mock('@/lib/claude/analyze', () => ({
  analyze: vi.fn().mockResolvedValue({
    section_1_terreno_general: 'g',
    section_2_campo_emocional: 'e',
    section_3_sistema_nervioso_cognitivo: 'n',
    section_4_sistema_inmunologico_linfatico: 'i',
    section_5_sistema_endocrino_hormonal: 'h',
    section_6_sistema_circulatorio_cardiorrespiratorio: 'c',
    section_7_sistema_hepatico: 'l',
    section_8_sistema_digestivo_intestinal: 'd',
    section_9_sistema_renal_urinario_reproductivo: 'r',
    section_10_sistema_estructural_integumentario: 's',
    section_11_conclusion: 'C',
  }),
}))
vi.mock('@/lib/claude/enhance-emotional-field', () => ({
  shouldEnhanceWithJyotish: () => true,
  enhanceEmotionalFieldWithJyotish: vi.fn(async (r: unknown) => r),
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
