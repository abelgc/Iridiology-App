import type { ReportContent, ReportSectionKey } from '@/types/report'

// A section may not declare a zone empty of markings when general terrain already
// placed a lacuna, furrow, crypt, pigment, scurf rim, or transversal in a region
// that overlaps that section. Vidya Dasi Poland (2026-09-27): terrain named radial
// furrows through the lower quadrants, then renal and strengths said the kidney
// clock had no open lacunae.
//
// Constitutional mentions with no clock or quadrant ("mild lacunar openings" as a
// fibre grade) do not count. A section that already names the same sign outside a
// denial sentence is left alone.

type Zone = 'renal' | 'hepatic' | 'digestive' | 'endocrine' | 'structural'

const SECTION_ZONES: Partial<Record<ReportSectionKey, Zone[]>> = {
  section_5_endocrine_hormonal: ['endocrine'],
  section_7_hepatic: ['hepatic'],
  section_8_digestive_intestinal: ['digestive'],
  section_9_renal_urinary: ['renal'],
  section_10_structural_integumentary: ['structural'],
  section_13_strengths_of_the_body: ['renal', 'hepatic', 'digestive', 'endocrine', 'structural'],
}

const SIGNS: { kind: string; pattern: RegExp }[] = [
  { kind: 'lacuna', pattern: /\b(lacunae?|lacunar|crypts?|lagunas?|lacunas?|criptas?|lakunen)\b/i },
  { kind: 'furrow', pattern: /\b(furrows?|surcos?|furchen)\b/i },
  { kind: 'pigment', pattern: /\b(pigments?|heterochromia|pigmentos?|heterocromia|heterocromía)\b/i },
  { kind: 'scurf', pattern: /\bscurf\b|\bborde oscuro\b/i },
  { kind: 'transversal', pattern: /\btransversals?\b/i },
]

const REGIONS: { zones: Zone[]; pattern: RegExp }[] = [
  { zones: ['renal', 'hepatic', 'digestive'], pattern: /lower quadrants?|cuadrantes inferiores|unteren quadranten/i },
  { zones: ['renal'], pattern: /\b9\s+o['’]clock|\b3\s+o['’]clock|\b9\s+en punto|\b3\s+en punto|\b(kidneys?|renal|adrenals?|riñones|riñón|riñon|nieren)\b/i },
  { zones: ['hepatic'], pattern: /\b8\s+o['’]clock|\b(livers?|hepatic|hígado|higado|leber)\b/i },
  { zones: ['digestive'], pattern: /\b[567]\s+o['’]clock|\b[567]\s+en punto|\b(colons?|pancrea\w*|stomach|intest\w*|páncreas|pancreas|estómago|estomago)\b/i },
  { zones: ['endocrine'], pattern: /\b(?:2|10|11)\s+o['’]clock|\b(?:2|10|11)\s+en punto|\b(thyroid|pituitary|tiroides|hipófisis|hipofisis|schilddrüse)\b/i },
  { zones: ['structural'], pattern: /\b(scurf rim|limbus|borde oscuro)\b/i },
]

// Explicit "nothing there" wording. A sentence that only uses these phrases does
// not count as acknowledging the sign it names.
const DENIAL = /without (?:open |dense )?lacunae|no (?:dense, sharply bordered )?open lacunae|no lacunae|does not show (?:a |any )?(?:clearly )?(?:defined |demarcated |open )?lacuna|clean fibre structure without|preserved fibre[^.!?]{0,80}without|rather than [^.!?]{0,40}lacuna|sin (?:lacunas|lagunas)(?: abiertas)?|no (?:se observan|hay) (?:lacunas|lagunas)|fibra limpia sin|ohne (?:offene )?lakunen|no scurf rim/i

export interface ZoneDenialFlag {
  sections: ReportSectionKey[]
  evidence: string[]
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
}

function affirms(text: string, sign: RegExp): boolean {
  return sentences(text).some((sentence) => sign.test(sentence) && !DENIAL.test(sentence))
}

export function detectZoneDenial(report: ReportContent): ZoneDenialFlag | null {
  const terrain = report.section_1_general_terrain
  if (!terrain) return null

  const placements: { zone: Zone; kind: string; sentence: string }[] = []
  for (const sentence of sentences(terrain)) {
    const signs = SIGNS.filter((sign) => sign.pattern.test(sentence))
    const regions = REGIONS.filter((region) => region.pattern.test(sentence))
    if (signs.length === 0 || regions.length === 0) continue
    for (const region of regions) {
      for (const zone of region.zones) {
        for (const sign of signs) {
          placements.push({ zone, kind: sign.kind, sentence })
        }
      }
    }
  }
  if (placements.length === 0) return null

  const flagged: ReportSectionKey[] = []
  const evidence: string[] = []

  for (const [key, zones] of Object.entries(SECTION_ZONES) as [ReportSectionKey, Zone[]][]) {
    const text = report[key]
    if (!text || !DENIAL.test(text)) continue
    const missed = placements.filter((placement) => {
      if (!zones.includes(placement.zone)) return false
      const sign = SIGNS.find((item) => item.kind === placement.kind)
      return sign ? !affirms(text, sign.pattern) : false
    })
    if (missed.length === 0) continue
    flagged.push(key)
    for (const placement of missed) {
      if (!evidence.includes(placement.sentence)) evidence.push(placement.sentence)
    }
  }

  return flagged.length > 0 ? { sections: flagged, evidence } : null
}
