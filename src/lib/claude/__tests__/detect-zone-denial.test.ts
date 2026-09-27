import { describe, it, expect } from 'vitest'
import { detectZoneDenial } from '../detect-zone-denial'
import type { ReportContent } from '@/types/report'

function report(overrides: Partial<ReportContent>): ReportContent {
  const base: ReportContent = {
    section_1_general_terrain: '',
    section_2_emotional_field: 'Autonomic tone is mildly irregular.',
    section_3_cognitive_nervous: 'Cranial zone fibre remains compact.',
    section_4_immune_lymphatic: 'Lymphatic edge is mildly diffuse.',
    section_5_endocrine_hormonal: 'Thyroid territory fibre is even.',
    section_6_circulatory_cardiorespiratory: 'Vascular tone is even.',
    section_7_hepatic: 'Hepatic pigment is mild and fibre stays readable.',
    section_8_digestive_intestinal: 'Transit tone is mildly reduced.',
    section_9_renal_urinary: 'Renal territory fibre is readable.',
    section_10_structural_integumentary: 'Outer zone fibre is even.',
    section_11_detected_axes: 'Axis: liver and skin elimination',
    section_12_conclusion: 'The dominant load is hepatic.',
    section_13_strengths_of_the_body: 'Recovery capacity is present.',
    section_14_recommendations: '**Liver**\nVitamins: A\nMinerals: Iron\nHerbs: Dandelion root',
  }
  return { ...base, ...overrides }
}

describe('detectZoneDenial', () => {
  it('REGRESSION (Vidya Dasi Poland, 2026-09-27): flags a kidney section that denies lacunae when terrain already placed furrows in the lower quadrants', () => {
    const flag = detectZoneDenial(report({
      section_1_general_terrain:
        'Fibre density is closer to Seda-lino, with small waves and mild lacunar openings rather than dense compaction. The right iris shows a radial furrow network through the lower quadrants.',
      section_9_renal_urinary:
        "The kidney territory at 9 o'clock shows preserved fibre density without open lacunae.",
      section_13_strengths_of_the_body:
        'The kidney territories show clean fibre structure without lacunae.',
    }))

    expect(flag?.sections).toEqual(expect.arrayContaining([
      'section_9_renal_urinary',
      'section_13_strengths_of_the_body',
    ]))
  })

  it('does not flag a denial when the only lacunae in terrain are constitutional and unzoned', () => {
    const flag = detectZoneDenial(report({
      section_1_general_terrain:
        'Fibre density is closer to Seda-lino, with small waves and mild lacunar openings rather than dense compaction.',
      section_9_renal_urinary:
        "The kidney territory at 9 o'clock shows preserved fibre density without open lacunae.",
    }))

    expect(flag).toBeNull()
  })

  it('does not flag a section that already accounts for the marking terrain placed in its zone', () => {
    const flag = detectZoneDenial(report({
      section_1_general_terrain:
        'The right iris shows a radial furrow network through the lower quadrants.',
      section_8_digestive_intestinal:
        'Radial furrows crossing the lower quadrants support sluggish transit.',
      section_9_renal_urinary:
        'Radial furrows in the kidney zone show reduced fibre integrity there.',
    }))

    expect(flag?.sections ?? []).not.toContain('section_8_digestive_intestinal')
    expect(flag?.sections ?? []).not.toContain('section_9_renal_urinary')
  })

  it('flags the thyroid section when terrain placed lacunae at 2 o\'clock and that section denies them', () => {
    const flag = detectZoneDenial(report({
      section_1_general_terrain:
        "Open lacunae at 2 o'clock in the right iris sit in the thyroid territory.",
      section_5_endocrine_hormonal:
        "No dense, sharply bordered open lacunae are visible in the thyroid territory at 2 o'clock.",
    }))

    expect(flag?.sections).toContain('section_5_endocrine_hormonal')
  })

  it('flags the Spanish wording of the same kidney denial', () => {
    const flag = detectZoneDenial(report({
      section_1_general_terrain:
        'El iris derecho muestra surcos radiales por los cuadrantes inferiores.',
      section_9_renal_urinary:
        'El territorio renal a las 9 en punto muestra fibra conservada sin lagunas abiertas.',
    }))

    expect(flag?.sections).toContain('section_9_renal_urinary')
  })
})
