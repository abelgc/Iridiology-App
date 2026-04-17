/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest'
import {
  STANDARD_ANALYSIS_SYSTEM_PROMPT,
  COMPARISON_ANALYSIS_SYSTEM_PROMPT,
  TECHNICAL_REVIEW_SYSTEM_PROMPT,
  buildChatSystemPrompt,
} from '../prompts'
import { REPORT_SECTION_KEYS } from '@/types/report'
import { reportContentSchema } from '@/lib/validators/report'

describe('Claude Prompts', () => {
  describe('STANDARD_ANALYSIS_SYSTEM_PROMPT', () => {
    it('should contain core clinical logic phrases', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('functional dysregulation')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('structural depletion')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('structural evidence')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('congestion')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('autonomic dysregulation')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('SEVERITY CALIBRATION')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('hepatic burden')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('autonomic tone')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('intestinal permeability')
    })

    it('should contain all 12 new section keys in JSON format', () => {
      const jsonMatch = STANDARD_ANALYSIS_SYSTEM_PROMPT.match(/{\s*"section_\d+/g)
      expect(jsonMatch).not.toBeNull()

      REPORT_SECTION_KEYS.forEach((key) => {
        expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain(`"${key}"`)
      })
    })

    it('should reference all 12 section names', () => {
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
    })

    it('should emphasize function over color', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Functional signs')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Structural signs')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Color alone')
    })
  })

  describe('COMPARISON_ANALYSIS_SYSTEM_PROMPT', () => {
    it('should contain comparison-specific temporal analysis rules', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('previous state')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('current state')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('direction of change')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('phase transitions')
    })

    it('should emphasize temporal comparison in base requirements', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('temporal comparative')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Prioritise FUNCTION')
    })

    it('should contain structural extraction and interpretation rules', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STRUCTURAL EXTRACTION')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('INTERPRETATION RULES')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('COMPARATIVE ANALYSIS')
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
    it('should validate correct 12-section objects', () => {
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

    it('should have all 12 section keys', () => {
      expect(REPORT_SECTION_KEYS).toHaveLength(12)
      expect(REPORT_SECTION_KEYS[0]).toBe('section_1_general_terrain')
      expect(REPORT_SECTION_KEYS[11]).toBe('section_12_conclusion')
    })
  })
})
