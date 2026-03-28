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
    it('should contain required sections (CALIDAD DE IMAGEN, EXTRACCIÓN ESTRUCTURAL, REGLAS DE INTERPRETACIÓN)', () => {
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('CALIDAD DE IMAGEN')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('EXTRACCIÓN ESTRUCTURAL')
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('REGLAS DE INTERPRETACIÓN')
    })

    it('should NOT mention color descriptions as primary instruction', () => {
      // The prompt should de-emphasize color and focus on function
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain(
        'Prioriza FUNCIÓN sobre descripción de color',
      )
      expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain(
        'No menciones tonos de color del iris',
      )
    })

    it('should contain all 11 section keys in JSON format', () => {
      const jsonMatch = STANDARD_ANALYSIS_SYSTEM_PROMPT.match(/{\s*"section_\d+/g)
      expect(jsonMatch).not.toBeNull()

      REPORT_SECTION_KEYS.forEach((key) => {
        expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain(`"${key}"`)
      })
    })
  })

  describe('COMPARISON_ANALYSIS_SYSTEM_PROMPT', () => {
    it('should contain comparison-specific rules', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain(
        'estado anterior → estado actual → dirección del cambio',
      )
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('transiciones de fase')
    })

    it('should contain all base requirements from standard prompt', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('CALIDAD DE IMAGEN')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('EXTRACCIÓN ESTRUCTURAL')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('REGLAS DE INTERPRETACIÓN')
    })
  })

  describe('TECHNICAL_REVIEW_SYSTEM_PROMPT', () => {
    it('should contain review-specific roles', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('VALIDA')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('CUESTIONA')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('AGREGA hallazgos')
    })

    it('should contain base requirements from standard prompt', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('CALIDAD DE IMAGEN')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('EXTRACCIÓN ESTRUCTURAL')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('REGLAS DE INTERPRETACIÓN')
    })

    it('should mention Validación, Cuestionamientos, and Hallazgos adicionales structure', () => {
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Validación**')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Cuestionamientos**')
      expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('**Hallazgos adicionales**')
    })
  })

  describe('buildChatSystemPrompt', () => {
    it('should include report content and patient context', () => {
      const reportContent = 'Test report content'
      const patientContext = 'Test patient context'

      const prompt = buildChatSystemPrompt(reportContent, patientContext)

      expect(prompt).toContain(reportContent)
      expect(prompt).toContain(patientContext)
      expect(prompt).toContain('INFORME:')
      expect(prompt).toContain('DATOS DEL PACIENTE:')
    })
  })

  describe('reportContentSchema', () => {
    it('should validate correct 11-section objects', () => {
      const validReport: Record<string, string> = {}
      REPORT_SECTION_KEYS.forEach((key) => {
        validReport[key] = `Content for ${key}`
      })

      const result = reportContentSchema.safeParse(validReport)
      expect(result.success).toBe(true)
    })

    it('should reject objects missing sections', () => {
      const invalidReport: Record<string, string> = {
        section_1_terreno_general: 'Content',
        section_2_campo_emocional: 'Content',
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

    it('should have all 11 section keys', () => {
      expect(REPORT_SECTION_KEYS).toHaveLength(11)
      expect(REPORT_SECTION_KEYS[0]).toBe('section_1_terreno_general')
      expect(REPORT_SECTION_KEYS[10]).toBe('section_11_conclusion')
    })
  })
})
