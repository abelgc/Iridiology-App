import { describe, it, expect, vi, beforeEach } from 'vitest'

// REGRESSION (Heidrun Schwarzenberger handout, 2026-10-05):
// tests/heidrun-schwarzenberger-client-report-en.md versus reports.id 6f84ed2b-5aea-4379-8c29-a5f4360f14d0.
// The handout lost four of five strengths, invented lifestyle advice in eight sections
// (dry brushing, bitters, belly breathing, whole foods...), re-introduced surgeries the
// report had explicitly not corroborated as "managed by your doctor", leaked "ciliary zone"
// to the client, dropped every gland name, and wrote in em-dashes throughout.
// Real path: rewriteReportForClient with only the Anthropic SDK mocked. Assertions are on
// the prompts the model actually receives and on the text the client actually gets.

const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: createMock } }
  }),
}))
const mockGetAnthropicApiKey = vi.fn().mockResolvedValue('test-anthropic-api-key')
vi.mock('@/lib/ai/get-provider', () => ({
  getAnthropicApiKey: () => mockGetAnthropicApiKey(),
}))

import { rewriteReportForClient } from '../writing-pipeline'
import type { ReportContent } from '@/types/report'

const report: ReportContent = {
  section_1_general_terrain: 'Lino fibre density across both irises.',
  section_2_emotional_field: 'Collarette tone shows held internal tension.',
  section_3_cognitive_nervous: 'The upper cranial arc governing hypothalamic-pituitary-pineal regulation is comparatively even; the lower arc is under sustained demand.',
  section_4_immune_lymphatic: 'No lymphatic rosary. The sinus surgery history has no residual marker.',
  section_5_endocrine_hormonal: 'Thyroid territory shows no new iris-based information.',
  section_6_circulatory_cardiorespiratory: 'A shallow lacuna sits in the cardiac territory.',
  section_7_hepatic: 'Hepatic zone pigment supports sluggish bile flow.',
  section_8_digestive_intestinal: 'An absorption ring marks reduced nutrient uptake.',
  section_9_renal_urinary: 'A shoe lacuna in the renal territory is a standalone finding. The ovarian surgery is not corroborated by any marker.',
  section_10_structural_integumentary: 'No scurf rim.',
  section_11_detected_axes: 'Axis: liver and digestive system',
  section_12_conclusion: 'Hepatic and intestinal load lead the case.',
  section_13_strengths_of_the_body: 'Lino fibre density. Intact upper cranial arc. No structural collapse markers. No sodium or cholesterol ring.',
  section_14_recommendations: '**Liver**\nVitamins: A\nMinerals: Iron\nHerbs: Dandelion root',
}

const systemKeys = [
  'section_2_emotional_field',
  'section_3_cognitive_nervous',
  'section_4_immune_lymphatic',
  'section_5_endocrine_hormonal',
  'section_6_circulatory_cardiorespiratory',
  'section_7_hepatic',
  'section_8_digestive_intestinal',
  'section_9_renal_urinary',
  'section_10_structural_integumentary',
]

const plannerFixture = {
  dominantPattern: 'hepatic and intestinal load',
  mainDriver: 'sluggish bile flow',
  symptomFindingMap: ['bloating -> reduced bile flow'],
  systemVerdicts: Object.fromEntries(
    systemKeys.map((k) => [k, { verdict: 'needs-action', clue: 'placeholder', findings: ['finding one', 'finding two'] }]),
  ),
  crossSystemLinks: ['liver load compounds the digestive load'],
  knownDiagnoses: [],
  strengths: [
    'dense fibre structure across both irises',
    'even upper nervous regulation',
    'no structural collapse markers',
    'no sodium or cholesterol ring',
  ],
  safety: { flags: [], constraint: null },
}

const groupKeys: Record<string, string[]> = {
  A: ['section_1_general_terrain', 'section_2_emotional_field', 'section_3_cognitive_nervous', 'section_4_immune_lymphatic', 'section_5_endocrine_hormonal'],
  B: ['section_6_circulatory_cardiorespiratory', 'section_7_hepatic', 'section_8_digestive_intestinal', 'section_9_renal_urinary', 'section_10_structural_integumentary'],
  C: ['section_11_detected_axes', 'section_12_conclusion', 'section_13_strengths_of_the_body'],
}

function writerText(keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, `Your liver is running slow — bile moves sluggishly, and that sits behind the bloating (${k}).`]))
}

function defaultImpl(params: { system: string }) {
  const system = params.system
  if (system.includes('You are the Planner')) {
    return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(plannerFixture) }] })
  }
  for (const role of ['A', 'B', 'C']) {
    if (system.includes(`You are Writer ${role}`)) {
      return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerText(groupKeys[role])) }] })
    }
  }
  return Promise.resolve({ content: [{ type: 'text', text: '{}' }] })
}

function callsByRole() {
  const calls = createMock.mock.calls.map((c) => c[0])
  return {
    planner: calls.find((p) => p.system.includes('You are the Planner')),
    writers: ['A', 'B', 'C'].map((r) => calls.find((p) => p.system.includes(`You are Writer ${r}`))),
  }
}

beforeEach(() => {
  mockGetAnthropicApiKey.mockReset().mockResolvedValue('test-anthropic-api-key')
  createMock.mockReset()
  createMock.mockImplementation(defaultImpl)
})

describe('handout fidelity: no invented advice, no doctor-care lines', () => {
  it('no Writer is told to add advice, a fix, or an order of support; every Writer is told the handout carries no advice', async () => {
    await rewriteReportForClient(report, 'en', 'Heidrun')
    const { writers } = callsByRole()
    for (const w of writers) {
      expect(w.system).not.toContain('say what to do')
      expect(w.system).not.toContain('direction of the fix')
      expect(w.system).not.toContain('order of support')
      expect(w.system).not.toContain("already under a doctor's care")
      expect(w.system).toContain('NO ADVICE')
      expect(w.system).toContain('The practitioner gives personalised advice in person')
    }
  })

  it('the Writer role line asks for a professional plain register that keeps gland and system names, not a gardener with zero health knowledge', async () => {
    await rewriteReportForClient(report, 'en', 'Heidrun')
    const { writers } = callsByRole()
    for (const w of writers) {
      expect(w.system).not.toContain('gardener')
      expect(w.system).not.toContain('zero health knowledge')
      expect(w.system).toContain('REGISTER')
      expect(w.system).toContain('hypothalamic-pituitary-pineal')
      expect(w.system).toContain('Where the brief is silent, the handout is silent')
      expect(w.system).not.toContain('the fix is')
      expect(w.system).not.toContain('turns this around')
    }
  })

  it('the LAYER MODEL bans the iris words that leaked to the Heidrun client: ciliary, zone, collarette, wreath, o\'clock', async () => {
    await rewriteReportForClient(report, 'en', 'Heidrun')
    const { writers } = callsByRole()
    for (const w of writers) {
      expect(w.system).toMatch(/Never write[^.]*"ciliary"/)
      expect(w.system).toMatch(/Never write[^.]*"collarette"/)
      expect(w.system).toMatch(/Never write[^.]*"wreath"/)
      expect(w.system).toMatch(/Never write[^.]*"o'clock"/)
    }
  })
})

describe('handout fidelity: strengths and secondary findings reach the Writers', () => {
  it('the Planner is asked for strengths[] and per-system findings[], and Writer C receives the strengths for section 13', async () => {
    await rewriteReportForClient(report, 'en', 'Heidrun')
    const { planner, writers } = callsByRole()
    expect(planner.system).toContain('"strengths": string[]')
    expect(planner.system).toContain('"findings": string[]')

    const writerC = writers[2]
    expect(writerC.system).toContain('brief.strengths')
    expect(writerC.system).not.toContain('drawn from any brief.systemVerdicts entries marked "fine"')
    const payload = JSON.parse(writerC.messages[0].content)
    expect(payload.strengths).toEqual(plannerFixture.strengths)
  })

  it('Writers A and B are told to carry every entry of findings[], including stated absences', async () => {
    await rewriteReportForClient(report, 'en', 'Heidrun')
    const { writers } = callsByRole()
    for (const w of writers.slice(0, 2)) {
      expect(w.system).toContain('every entry of')
      expect(w.system).toContain('findings')
    }
  })

  it('the Planner may only list a known diagnosis the report ties to a corroborating iris finding; not-corroborated conditions are dropped', async () => {
    await rewriteReportForClient(report, 'en', 'Heidrun')
    const { planner } = callsByRole()
    expect(planner.system).toContain('not corroborated')
    expect(planner.system).toContain('leave it out of knownDiagnoses')
  })
})

describe('handout fidelity: no em-dashes', () => {
  it('every Writer is told not to write em-dashes, and any the model still writes are removed before the client sees them', async () => {
    const result = await rewriteReportForClient(report, 'en', 'Heidrun')
    const { writers } = callsByRole()
    for (const w of writers) {
      expect(w.system).toContain('Never use an em-dash')
    }
    for (const [key, value] of Object.entries(result)) {
      expect(value, `${key} still contains a dash`).not.toMatch(/[—–]/)
    }
    expect(result.section_7_hepatic).toBe('Your liver is running slow, bile moves sluggishly, and that sits behind the bloating (section_7_hepatic).')
    expect(result.section_14_recommendations).toBe(report.section_14_recommendations)
  })
})
