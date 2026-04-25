import { describe, it, expect } from 'vitest'
import { generateReportPdf } from '../pdf'
import type { ReportContent } from '@/types/report'

const mockReport: ReportContent = {
  section_1_general_terrain: 'Your body shows a strong constitutional foundation.',
  section_2_emotional_field: 'Your nervous system is under moderate stress.',
  section_3_cognitive_nervous: 'Cognitive function appears stable.',
  section_4_immune_lymphatic: 'Immune system is functioning well.',
  section_5_endocrine_hormonal: 'Hormonal balance shows minor imbalance.',
  section_6_circulatory_cardiorespiratory: 'Cardiovascular system appears healthy.',
  section_7_hepatic: 'Liver function shows some congestion.',
  section_8_digestive_intestinal: 'Digestive system shows signs of stress.',
  section_9_renal_urinary: 'Kidney function is within normal range.',
  section_10_structural_integumentary: 'Structural integrity is good.',
  section_11_detected_axes: 'Axis: liver and digestive system',
  section_12_conclusion: 'Overall health is good with some areas for improvement.',
}

describe('generateReportPdf', () => {
  it('returns a non-empty Buffer', async () => {
    const buf = await generateReportPdf(mockReport)
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(1000)
  }, 15000)

  it('starts with PDF magic bytes', async () => {
    const buf = await generateReportPdf(mockReport)
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  }, 15000)
})
