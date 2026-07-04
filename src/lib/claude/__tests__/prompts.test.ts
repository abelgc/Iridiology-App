/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest'
import {
  STANDARD_ANALYSIS_SYSTEM_PROMPT,
  STANDARD_ANALYSIS_SYSTEM_PROMPT_EN,
  COMPARISON_ANALYSIS_SYSTEM_PROMPT,
  TECHNICAL_REVIEW_SYSTEM_PROMPT,
  IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE,
  IRIDOLOGY_IRIS_TERRITORY_MAP,
  IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP,
  buildChatSystemPrompt,
  getStandardAnalysisSystemPrompt,
} from '../prompts'
import { REPORT_SECTION_KEYS } from '@/types/report'
import { reportContentSchema } from '@/lib/validators/report'
import { TIER_MODELS } from '@/lib/ai/get-provider'

describe('Claude Prompts', () => {
  describe('IRIDOLOGY_IRIS_TERRITORY_MAP', () => {
    it('maps clock positions for both irises with specific territories', () => {
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('RIGHT IRIS')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('LEFT IRIS')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('12 o\'clock')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Liver')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Heart')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('pituitary')
    })

    it('names ANS wreath arc territories with cranial/pituitary depth', () => {
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('ANS WREATH ARC TERRITORIES')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Upper arc')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('hypothalamus')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('jaw')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('cerebral circulation')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Lower arc')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('sciatic')
    })

    it('describes zone rings from centre outward', () => {
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Pupillary zone')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Collarette')
      expect(IRIDOLOGY_IRIS_TERRITORY_MAP).toContain('Limbus')
    })
  })

  describe('IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE', () => {
    it('encodes colour associations, sclera, the meaning law, and the safety boundary', () => {
      const g = IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE
      expect(g).toContain('COLOUR AND FIBRE GUIDE')
      expect(g).toContain('SCLERA')
      expect(g).toContain('chicken-fat')
      expect(g).toContain('Brown')
      expect(g).toContain('Fluorescent orange')
      expect(g).toContain('SAFETY BOUNDARY')
      expect(g).toContain('medical referral')
      // The meaning law:
      expect(g).toContain('never name a colour without')
      // Examples, not a closed list — the AI must interpret any colour it sees:
      expect(g).toContain('not a fixed or exhaustive list')
      expect(g).toContain('ANY colour')
    })
  })

  describe('STANDARD_ANALYSIS_SYSTEM_PROMPT', () => {
    it('should contain body-first clinical writing directives', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('metabolic processes')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('hormonal regulation')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('elimination pathways')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('nervous system behavior')
    })

    it('allows iris anatomy that supports interpretation', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('anatomy must always SUPPORT')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('INTERPRETATION DISCIPLINE')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).not.toContain('Never describe the iris')
    })

    it('should contain all 13 section keys in JSON format', () => {
      const jsonMatch = STANDARD_ANALYSIS_SYSTEM_PROMPT.match(/{\s*"section_\d+/g)
      expect(jsonMatch).not.toBeNull()

      REPORT_SECTION_KEYS.forEach((key) => {
        expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain(`"${key}"`)
      })
    })

    it('should reference all 13 section names', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('General Terrain')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Emotional Field')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Cognitive')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Immune')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Endocrine')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Circulatory')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Hepatic')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Digestive')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Renal')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Structural')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Detected')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Conclusion')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Strengths of the Body')
    })

    it('should contain clinical history integration rules', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('CLINICAL HISTORY INTEGRATION')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('CONFIRMATION')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('PRECLINICAL SIGN')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('RESTRAINT')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('PRIORITISATION')
    })

    it('should prohibit mechanistic biochemical language', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('PROHIBITED MECHANISTIC LANGUAGE')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('Phase I detoxification')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('cytochrome P450')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('functional outcome')
    })

    it('should require inter-system connections', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('SYSTEM CONNECTIONS')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('liver and digestive system')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT_EN).toContain('Do not describe any system in isolation')
    })

    it('contains structural pattern detection and territory mapping pre-analysis phase', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('PRE-ANALYSIS REASONING: STRUCTURAL PATTERN DETECTION AND TERRITORY MAPPING')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 1 — INVENTORY ALL IRIS PATTERNS')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 2 — TERRITORY MAPPING')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 3 — PATTERN-GROUNDED SECTION WRITING')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Pattern and location → Territory → System function → Clinical meaning')
    })

    it('section hierarchy leads with iris pattern and territory', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Key iris pattern(s) and territory')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('drawn from your pre-analysis inventory')
    })

    it('integrates the colour, sclera, and meaning guide', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('SCLERA')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('never name a colour without')
    })
  })

  describe('COMPARISON_ANALYSIS_SYSTEM_PROMPT', () => {
    it('frames comparison as a practitioner progress review', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('progress review')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('practitioner progress note')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('not a new iris analysis')
    })

    it('evaluates iridological patterns internally before writing', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('INTERNAL EVALUATION')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Hepatic-Biliary Pattern')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Lymphatic-Eliminative Pattern')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Autonomic Nervous System Pattern')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Do not expose this internal checklist in the output')
    })

    it('classifies mobilization as improvement not worsening', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('MOBILIZATION RULE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('mobilization = IMPROVEMENT')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('peripheral expression')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('scleral vascular activation')
    })

    it('distinguishes structural from functional change velocity', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STRUCTURAL VS FUNCTIONAL')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Functional patterns')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('stability is expected, not a failure')
    })

    it('emits exactly 2 progress keys and none of the old schema keys', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('"comp_1_improvements"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('"comp_2_not_improved"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('"comp_1_trajectory"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('"comp_2_deteriorations"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('"section_1_general_terrain"')
    })

    it('bans image-number references and requires natural clinical language', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('IMAGE REFERENCE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('previous right eye')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('current right eye')
    })

    it('reads iris and sclera colour as evidence', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('SCLERA')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('Do not mention iris colour tones')
    })

    it('embeds the iris territory map for zone interpretation depth', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('IRIS TERRITORY MAP')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('pituitary')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('ANS WREATH ARC TERRITORIES')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('jaw')
    })
  })

  describe('TECHNICAL_REVIEW_SYSTEM_PROMPT', () => {
    it('should contain review-specific roles', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('VALIDATE')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('QUESTION')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('ADD')
    })

    it('should mention Validation, Questions, and Additional findings structure', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Validation**')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Questions**')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Additional findings**')
    })

    it('should contain structural extraction and interpretation rules', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('STRUCTURAL EXTRACTION')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('INTERPRETATION RULES')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('colleague-to-colleague')
    })

    it('contains interpretation discipline', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('INTERPRETATION DISCIPLINE')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('anatomy must SUPPORT the interpretation')
    })

    it('contains structural pattern detection for independent review', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('PRE-ANALYSIS REASONING: STRUCTURAL PATTERN DETECTION AND TERRITORY MAPPING')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('STEP 1 — INDEPENDENT PATTERN INVENTORY')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('STEP 3 — PATTERN-GROUNDED REVIEW')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('A review finding without a cited iris pattern and territory is an opinion, not a clinical observation')
    })

    it('reads colour+sclera as supporting evidence, not forbidden', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('SCLERA')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).not.toContain('Do not mention iris colour tones')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).not.toContain('Prioritise reading these structures over any chromatic observation')
    })
  })

  describe('buildChatSystemPrompt', () => {
    it('should include report content and patient context', () => {
      const reportContent = 'Test report content'
      const patientContext = 'Test patient context'

      const prompt = buildChatSystemPrompt(reportContent, patientContext)

      expect(prompt).toContain(reportContent)
      expect(prompt).toContain(patientContext)
      expect(prompt).toContain('REPORT:')
      expect(prompt).toContain('PATIENT DATA:')
    })
  })

  describe('reportContentSchema', () => {
    it('should validate correct 13-section objects', () => {
      const validReport: Record<string, string> = {}
      REPORT_SECTION_KEYS.forEach((key) => {
        validReport[key] = `Content for ${key}`
      })

      const result = reportContentSchema.safeParse(validReport)
      expect(result.success).toBe(true)
    })

    it('should reject objects missing sections', () => {
      const invalidReport: Record<string, string> = {
        section_1_general_terrain: 'Content',
        section_2_emotional_field: 'Content',
        // Missing other sections
      }

      const result = reportContentSchema.safeParse(invalidReport)
      expect(result.success).toBe(false)
    })

    it('should reject empty section values', () => {
      const invalidReport: Record<string, string> = {}
      REPORT_SECTION_KEYS.forEach((key) => {
        invalidReport[key] = '' // Empty strings should fail
      })

      const result = reportContentSchema.safeParse(invalidReport)
      expect(result.success).toBe(false)
    })

    it('should have all 14 section keys', () => {
      expect(REPORT_SECTION_KEYS).toHaveLength(14)
      expect(REPORT_SECTION_KEYS[0]).toBe('section_1_general_terrain')
      expect(REPORT_SECTION_KEYS[11]).toBe('section_12_conclusion')
      expect(REPORT_SECTION_KEYS[12]).toBe('section_13_strengths_of_the_body')
      expect(REPORT_SECTION_KEYS[13]).toBe('section_14_recommendations')
    })

    it('IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP shares organ names with the acute/chronic catalogue and excludes shoulder joint', () => {
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).toContain('Liver:')
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).toContain('Vitamins —')
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).toContain('Minerals —')
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).toContain('Herbs —')
      expect(IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP).not.toContain('Shoulder joint:')
    })
  })

  describe('TIER_MODELS', () => {
    it('maps basic_12 to haiku and gpt-4.1-mini', () => {
      expect(TIER_MODELS.basic_12.anthropic).toMatch(/haiku/i)
      expect(TIER_MODELS.basic_12.openai).toBe('gpt-4.1-mini')
    })

    it('maps premium_19_90 to sonnet and gpt-4o', () => {
      expect(TIER_MODELS.premium_19_90.anthropic).toMatch(/sonnet/i)
      expect(TIER_MODELS.premium_19_90.openai).toBe('gpt-4o')
    })
  })

  describe('getStandardAnalysisSystemPrompt', () => {
    it('includes a Spanish language directive when lang is es', () => {
      const prompt = getStandardAnalysisSystemPrompt('es')
      expect(prompt).toContain('Spanish')
      expect(prompt).not.toContain('exclusively in English')
    })

    it('includes an English language directive when lang is en', () => {
      const prompt = getStandardAnalysisSystemPrompt('en')
      expect(prompt).toContain('English')
      expect(prompt).not.toContain('exclusively in English')
    })

    it('never contains the hardcoded override phrase for any lang', () => {
      for (const lang of ['en', 'es'] as const) {
        expect(getStandardAnalysisSystemPrompt(lang)).not.toContain(
          'Write ALL report content exclusively in English'
        )
      }
    })
  })
})
