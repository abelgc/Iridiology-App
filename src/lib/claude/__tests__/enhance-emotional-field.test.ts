import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  shouldEnhanceWithJyotish,
  enhanceEmotionalFieldWithJyotish,
  type JyotishEnhancementData,
} from '../enhance-emotional-field'
import type { ReportContent } from '@/types/report'
import { REPORT_SECTION_KEYS } from '@/types/report'

// Mock the getAIProvider function
vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: vi.fn(),
}))

import { getAIProvider } from '@/lib/ai/get-provider'

const mockGetAIProvider = getAIProvider as unknown as ReturnType<typeof vi.fn>

// Helper function to create a complete mock report with all 12 sections
function createMockReport(overrides: Partial<ReportContent> = {}): ReportContent {
  const mockReport: ReportContent = {
    section_1_general_terrain: 'General terrain analysis with various markers and constitutional patterns observed.',
    section_2_emotional_field: 'The emotional field shows patterns of stress accumulation with signs of anxiety and mild depression.',
    section_3_cognitive_nervous: 'Cognitive function appears intact with some signs of mental fatigue and occasional anxiety.',
    section_4_immune_lymphatic: 'Immune response appears adequate with minor lymphatic congestion.',
    section_5_endocrine_hormonal: 'Endocrine system shows balanced function with minor stress hormone elevation.',
    section_6_circulatory_cardiorespiratory: 'Circulatory system demonstrates good function with adequate oxygenation.',
    section_7_hepatic: 'Hepatic system shows normal function without signs of significant congestion.',
    section_8_digestive_intestinal: 'Digestive system demonstrates adequate function with minor enzyme activity variations.',
    section_9_renal_urinary: 'Renal system shows good filtration capacity and normal elimination patterns.',
    section_10_structural_integumentary: 'Structural system demonstrates adequate integrity with normal tissue tone.',
    section_11_detected_axes: 'Various functional axes detected including stress and constitutional patterns.',
    section_12_conclusion: 'Overall assessment suggests a moderately healthy individual with areas for optimization in stress management.',
  }

  return { ...mockReport, ...overrides }
}

// Helper function to create astrology data with valid values
function createAstrologyData(overrides: Partial<JyotishEnhancementData> = {}): JyotishEnhancementData {
  const defaultData: JyotishEnhancementData = {
    date_of_birth: '1990-01-15',
    country_of_birth: 'India',
    city_of_birth: 'Mumbai',
    time_of_day: 'morning',
  }

  return { ...defaultData, ...overrides }
}

describe('Jyotish Emotional Field Enhancement', () => {
  describe('shouldEnhanceWithJyotish', () => {
    it('should return true when all four fields are present with valid values', () => {
      const data = createAstrologyData()
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(true)
    })

    it('should return false when date_of_birth is missing', () => {
      const data: Partial<JyotishEnhancementData> = {
        country_of_birth: 'India',
        city_of_birth: 'Mumbai',
        time_of_day: 'morning',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when date_of_birth is empty string', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '',
        country_of_birth: 'India',
        city_of_birth: 'Mumbai',
        time_of_day: 'morning',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when country_of_birth is missing', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '1990-01-15',
        city_of_birth: 'Mumbai',
        time_of_day: 'morning',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when country_of_birth is empty string', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '1990-01-15',
        country_of_birth: '',
        city_of_birth: 'Mumbai',
        time_of_day: 'morning',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when city_of_birth is missing', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '1990-01-15',
        country_of_birth: 'India',
        time_of_day: 'morning',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when city_of_birth is empty string', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '1990-01-15',
        country_of_birth: 'India',
        city_of_birth: '',
        time_of_day: 'morning',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when time_of_day is missing', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '1990-01-15',
        country_of_birth: 'India',
        city_of_birth: 'Mumbai',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return true when time_of_day is "morning"', () => {
      const data = createAstrologyData({ time_of_day: 'morning' })
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(true)
    })

    it('should return true when time_of_day is "evening"', () => {
      const data = createAstrologyData({ time_of_day: 'evening' })
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(true)
    })

    it('should return false when time_of_day is invalid value', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '1990-01-15',
        country_of_birth: 'India',
        city_of_birth: 'Mumbai',
        time_of_day: 'afternoon' as unknown as 'morning' | 'evening',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when time_of_day is empty string', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '1990-01-15',
        country_of_birth: 'India',
        city_of_birth: 'Mumbai',
        time_of_day: '' as unknown as 'morning' | 'evening',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when multiple fields are missing', () => {
      const data: Partial<JyotishEnhancementData> = {
        date_of_birth: '1990-01-15',
      }
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })

    it('should return false when all fields are missing', () => {
      const data: Partial<JyotishEnhancementData> = {}
      const result = shouldEnhanceWithJyotish(data)
      expect(result).toBe(false)
    })
  })

  describe('enhanceEmotionalFieldWithJyotish', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should successfully enhance report when provider returns valid JSON with chakra and emotion', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'John Doe'

      const mockChakraRecommendation = {
        chakra: 'Heart',
        emotion: 'compassion',
        reasoning: 'Venus placement suggests emphasis on emotional opening and self-compassion.',
      }

      const enhancedEmotionalField = 'Enhanced emotional field text with Jyotish insights integrated.'

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: enhancedEmotionalField,
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result.section_2_emotional_field).toBe(enhancedEmotionalField)
      expect(mockProvider.complete).toHaveBeenCalledTimes(2)
    })

    it('should return original report when Jyotish JSON parsing fails for chakra response', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'Jane Doe'

      const invalidJson = 'Not valid JSON at all'

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete.mockResolvedValueOnce({
        text: invalidJson,
        stopReason: 'end_turn',
      })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result.section_2_emotional_field).toBe(mockReport.section_2_emotional_field)
      expect(result).toEqual(mockReport)
    })

    it('should return original report when provider call fails with error', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'Jane Doe'

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete.mockRejectedValueOnce(new Error('Provider connection failed'))

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result).toEqual(mockReport)
      expect(result.section_2_emotional_field).toBe(mockReport.section_2_emotional_field)
    })

    it('should return original report when getAIProvider fails', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'Jane Doe'

      mockGetAIProvider.mockRejectedValueOnce(new Error('Failed to initialize provider'))

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result).toEqual(mockReport)
    })

    it('should return original report when parsed chakra recommendation is missing required fields', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'Jane Doe'

      const incompleteChakraRecommendation = {
        chakra: 'Heart',
        // Missing emotion field
        reasoning: 'Some reasoning',
      }

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete.mockResolvedValueOnce({
        text: JSON.stringify(incompleteChakraRecommendation),
        stopReason: 'end_turn',
      })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result.section_2_emotional_field).toBe(mockReport.section_2_emotional_field)
      expect(result).toEqual(mockReport)
    })

    it('should return original report when parsed chakra recommendation is missing chakra field', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'Jane Doe'

      const incompleteChakraRecommendation = {
        // Missing chakra field
        emotion: 'compassion',
        reasoning: 'Some reasoning',
      }

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete.mockResolvedValueOnce({
        text: JSON.stringify(incompleteChakraRecommendation),
        stopReason: 'end_turn',
      })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result.section_2_emotional_field).toBe(mockReport.section_2_emotional_field)
      expect(result).toEqual(mockReport)
    })

    it('should return original report when blend response is empty', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'Jane Doe'

      const mockChakraRecommendation = {
        chakra: 'Heart',
        emotion: 'compassion',
        reasoning: 'Venus placement suggests emotional opening.',
      }

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: '',
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result).toEqual(mockReport)
      expect(result.section_2_emotional_field).toBe(mockReport.section_2_emotional_field)
    })

    it('should return original report when blend response is only whitespace', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'Jane Doe'

      const mockChakraRecommendation = {
        chakra: 'Heart',
        emotion: 'compassion',
        reasoning: 'Venus placement suggests emotional opening.',
      }

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: '   \n\t  ',
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result).toEqual(mockReport)
      expect(result.section_2_emotional_field).toBe(mockReport.section_2_emotional_field)
    })

    it('should modify only section_2_emotional_field and keep all other sections unchanged', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'John Doe'

      const mockChakraRecommendation = {
        chakra: 'Solar Plexus',
        emotion: 'empowerment',
        reasoning: 'Mars placement suggests need for personal power integration.',
      }

      const enhancedEmotionalField = 'New enhanced emotional field content with Jyotish insights.'

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: enhancedEmotionalField,
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      // Verify section 2 is modified
      expect(result.section_2_emotional_field).toBe(enhancedEmotionalField)

      // Verify all other sections remain unchanged
      expect(result.section_1_general_terrain).toBe(mockReport.section_1_general_terrain)
      expect(result.section_3_cognitive_nervous).toBe(mockReport.section_3_cognitive_nervous)
      expect(result.section_4_immune_lymphatic).toBe(mockReport.section_4_immune_lymphatic)
      expect(result.section_5_endocrine_hormonal).toBe(mockReport.section_5_endocrine_hormonal)
      expect(result.section_6_circulatory_cardiorespiratory).toBe(mockReport.section_6_circulatory_cardiorespiratory)
      expect(result.section_7_hepatic).toBe(mockReport.section_7_hepatic)
      expect(result.section_8_digestive_intestinal).toBe(mockReport.section_8_digestive_intestinal)
      expect(result.section_9_renal_urinary).toBe(mockReport.section_9_renal_urinary)
      expect(result.section_10_structural_integumentary).toBe(mockReport.section_10_structural_integumentary)
      expect(result.section_11_detected_axes).toBe(mockReport.section_11_detected_axes)
      expect(result.section_12_conclusion).toBe(mockReport.section_12_conclusion)
    })

    it('should verify all 12 other sections remain unchanged when enhancing', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'John Doe'

      const mockChakraRecommendation = {
        chakra: 'Throat',
        emotion: 'authentic expression',
        reasoning: 'Mercury placement emphasizes communication and truth.',
      }

      const enhancedEmotionalField = 'Enhanced with throat chakra insights for authentic expression.'

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: enhancedEmotionalField,
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      // Check that only section 2 changed
      const changedSections = REPORT_SECTION_KEYS.filter((key) => mockReport[key] !== result[key])
      expect(changedSections).toEqual(['section_2_emotional_field'])

      // Verify the changed section has new content
      expect(result.section_2_emotional_field).toBe(enhancedEmotionalField)
      expect(result.section_2_emotional_field).not.toBe(mockReport.section_2_emotional_field)
    })

    it('should call provider.complete twice with correct parameters', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData({
        date_of_birth: '1985-03-20',
        city_of_birth: 'New Delhi',
      })
      const patientName = 'Alice Smith'

      const mockChakraRecommendation = {
        chakra: 'Root',
        emotion: 'grounding',
        reasoning: 'Saturn aspects suggest need for stability and grounding.',
      }

      const enhancedContent = 'Enhanced emotional content.'

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: enhancedContent,
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      // Verify first call (chakra recommendation)
      const firstCall = mockProvider.complete.mock.calls[0][0]
      expect(firstCall.userText).toContain(`Patient: ${patientName}`)
      expect(firstCall.userText).toContain(astrologyData.date_of_birth)
      expect(firstCall.userText).toContain(astrologyData.city_of_birth)
      expect(firstCall.userText).toContain(astrologyData.country_of_birth)
      expect(firstCall.userText).toContain(astrologyData.time_of_day)
      expect(firstCall.maxTokens).toBe(500)

      // Verify second call (blend response)
      const secondCall = mockProvider.complete.mock.calls[1][0]
      expect(secondCall.userText).toContain(mockReport.section_2_emotional_field)
      expect(secondCall.userText).toContain(mockChakraRecommendation.chakra)
      expect(secondCall.userText).toContain(mockChakraRecommendation.emotion)
      expect(secondCall.maxTokens).toBe(1000)
    })

    it('should trim whitespace from enhanced emotional field', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'John Doe'

      const mockChakraRecommendation = {
        chakra: 'Heart',
        emotion: 'compassion',
        reasoning: 'Placement suggests emotional opening.',
      }

      const enhancedWithWhitespace = '  \n  Enhanced content with leading and trailing spaces  \n  '

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: enhancedWithWhitespace,
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result.section_2_emotional_field).toBe(enhancedWithWhitespace.trim())
      expect(result.section_2_emotional_field).not.toContain('\n')
    })

    it('should handle chakra recommendation with extra fields without issue', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'John Doe'

      const mockChakraRecommendation = {
        chakra: 'Heart',
        emotion: 'compassion',
        reasoning: 'Placement suggests emotional opening.',
        extraField: 'This should be ignored',
        anotherExtra: 12345,
      }

      const enhancedEmotionalField = 'Enhanced emotional field text.'

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: enhancedEmotionalField,
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      expect(result.section_2_emotional_field).toBe(enhancedEmotionalField)
      expect(mockProvider.complete).toHaveBeenCalledTimes(2)
    })

    it('should handle special characters in patient name', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = "O'Brien-García, José María"

      const mockChakraRecommendation = {
        chakra: 'Heart',
        emotion: 'compassion',
        reasoning: 'Placement suggests emotional opening.',
      }

      const enhancedEmotionalField = 'Enhanced emotional field text.'

      const mockProvider = {
        complete: vi.fn(),
      }

      mockProvider.complete
        .mockResolvedValueOnce({
          text: JSON.stringify(mockChakraRecommendation),
          stopReason: 'end_turn',
        })
        .mockResolvedValueOnce({
          text: enhancedEmotionalField,
          stopReason: 'end_turn',
        })

      mockGetAIProvider.mockResolvedValueOnce(mockProvider)

      const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

      const firstCall = mockProvider.complete.mock.calls[0][0]
      expect(firstCall.userText).toContain(patientName)
      expect(result.section_2_emotional_field).toBe(enhancedEmotionalField)
    })

    it('should handle various valid date formats', async () => {
      const mockReport = createMockReport()
      const patientName = 'John Doe'
      const validDates = ['2000-12-31', '1950-01-01', '1999-06-15']

      for (const dateOfBirth of validDates) {
        vi.clearAllMocks()

        const astrologyData = createAstrologyData({ date_of_birth: dateOfBirth })

        const mockChakraRecommendation = {
          chakra: 'Heart',
          emotion: 'compassion',
          reasoning: 'Placement suggests emotional opening.',
        }

        const enhancedEmotionalField = 'Enhanced emotional field text.'

        const mockProvider = {
          complete: vi.fn(),
        }

        mockProvider.complete
          .mockResolvedValueOnce({
            text: JSON.stringify(mockChakraRecommendation),
            stopReason: 'end_turn',
          })
          .mockResolvedValueOnce({
            text: enhancedEmotionalField,
            stopReason: 'end_turn',
          })

        mockGetAIProvider.mockResolvedValueOnce(mockProvider)

        const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

        const firstCall = mockProvider.complete.mock.calls[0][0]
        expect(firstCall.userText).toContain(dateOfBirth)
        expect(result.section_2_emotional_field).toBe(enhancedEmotionalField)
      }
    })

    it('should handle different chakra types in recommendation', async () => {
      const mockReport = createMockReport()
      const astrologyData = createAstrologyData()
      const patientName = 'John Doe'

      const chakras = ['Root', 'Sacral', 'Solar Plexus', 'Heart', 'Throat', 'Third Eye', 'Crown']

      for (const chakra of chakras) {
        vi.clearAllMocks()

        const mockChakraRecommendation = {
          chakra,
          emotion: `emotion for ${chakra}`,
          reasoning: `Reasoning for ${chakra}`,
        }

        const enhancedEmotionalField = `Enhanced content for ${chakra}`

        const mockProvider = {
          complete: vi.fn(),
        }

        mockProvider.complete
          .mockResolvedValueOnce({
            text: JSON.stringify(mockChakraRecommendation),
            stopReason: 'end_turn',
          })
          .mockResolvedValueOnce({
            text: enhancedEmotionalField,
            stopReason: 'end_turn',
          })

        mockGetAIProvider.mockResolvedValueOnce(mockProvider)

        const result = await enhanceEmotionalFieldWithJyotish(mockReport, patientName, astrologyData)

        expect(result.section_2_emotional_field).toBe(enhancedEmotionalField)
      }
    })
  })
})
