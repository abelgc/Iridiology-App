/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest'
import {
  STANDARD_ANALYSIS_SYSTEM_PROMPT,
  STANDARD_ANALYSIS_SYSTEM_PROMPT_EN,
  COMPARISON_ANALYSIS_SYSTEM_PROMPT,
  TECHNICAL_REVIEW_SYSTEM_PROMPT,
  IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE,
  buildChatSystemPrompt,
  getStandardAnalysisSystemPrompt,
} from '../prompts'
import { REPORT_SECTION_KEYS } from '@/types/report'
import { reportContentSchema } from '@/lib/validators/report'
import { TIER_MODELS } from '@/lib/ai/get-provider'

describe('Claude Prompts', () => {
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
    it('frames comparison as an evolution report, not a system report', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('CORE PRINCIPLE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('evolution report, not a follow-up practitioner report')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('what changed between the previous and current images')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('The comparison drives the report')
    })

    it('follows detect -> classify -> interpret, in that order', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 1 — DETECT CHANGES BEFORE TOUCHING SYSTEMS')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 2 — CLASSIFY EVERY FINDING')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STEP 3 — INTERPRET ONLY AFTER CLASSIFYING')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('A. Clear improvements')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('E. Deteriorations')
    })

    it('keeps the structural-vs-functional rule and the priority order', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STRUCTURAL VS FUNCTIONAL')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Do not require structural regeneration before acknowledging improvement')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('PRIORITY ORDER')
    })

    it('grades every change with Major/Moderate/Mild and enforces 4-line finding format', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('CHANGE MAGNITUDE CLASSIFICATION')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Major improvement')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Major deterioration')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Previous:')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Current:')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Change:')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Interpretation:')
    })

    it('requires overall trajectory closing statement and deteriorations-first order', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('OVERALL TRAJECTORY')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Strong improvement despite persistent constitutional weakness')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Significant deterioration requiring immediate protocol reassessment')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Stable — no clinically significant change between readings')
    })

    it('emits the 7 evolution keys and none of the 13 system keys', () => {
      const compKeys = [
        'comp_1_trajectory', 'comp_2_deteriorations', 'comp_3_improvements',
        'comp_4_new_findings', 'comp_5_stable', 'comp_6_axes',
        'comp_7_clinical_priorities',
      ]
      compKeys.forEach((k) => expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain(`"${k}"`))
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('"section_1_general_terrain"')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('"section_7_hepatic"')
    })

    it('reads iris+sclera colour as evidence, not forbidden', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('SCLERA')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('Do not mention iris colour tones')
    })

    it('bans the image-quality excuse and forces a change direction', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('NEVER AN EXCUSE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('new baseline')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('CHANGE CALIBRATION')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('magnification')
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

    it('should have all 13 section keys', () => {
      expect(REPORT_SECTION_KEYS).toHaveLength(13)
      expect(REPORT_SECTION_KEYS[0]).toBe('section_1_general_terrain')
      expect(REPORT_SECTION_KEYS[11]).toBe('section_12_conclusion')
      expect(REPORT_SECTION_KEYS[12]).toBe('section_13_strengths_of_the_body')
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
