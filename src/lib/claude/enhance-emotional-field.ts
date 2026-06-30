import { getAIProvider } from '@/lib/ai/get-provider'
import { JYOTISH_ENHANCEMENT_SYSTEM_PROMPT } from './prompts'
import { ReportContent } from '@/types/report'

export interface JyotishEnhancementData {
  date_of_birth: string
  country_of_birth: string
  city_of_birth: string
  time_of_day: string
}

interface ChakraRecommendation {
  chakra: string
  emotion: string
  reasoning: string
}

export function shouldEnhanceWithJyotish(data: any): boolean {
  return !!(
    data?.date_of_birth &&
    typeof data.date_of_birth === 'string' &&
    data?.country_of_birth &&
    typeof data.country_of_birth === 'string' &&
    data?.city_of_birth &&
    typeof data.city_of_birth === 'string' &&
    (data?.time_of_day === 'morning' || data?.time_of_day === 'evening')
  )
}

export async function enhanceEmotionalFieldWithJyotish(
  reportContent: ReportContent,
  patientName: string,
  astrologyData: JyotishEnhancementData,
  language: string = 'es',
): Promise<ReportContent> {
  try {
    const provider = await getAIProvider()

    const chakraPrompt = `Patient: ${patientName}
Date of Birth: ${astrologyData.date_of_birth}
Place of Birth: ${astrologyData.city_of_birth}, ${astrologyData.country_of_birth}
Time of Day: ${astrologyData.time_of_day}

Based on this birth data, recommend the primary chakra and main emotion to focus on for emotional healing. Respond in ${language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English'}.`

    // First call: Get chakra and emotion recommendation
    const chakraResponse = await provider.complete({
      systemPrompt: JYOTISH_ENHANCEMENT_SYSTEM_PROMPT,
      userText: chakraPrompt,
      images: [],
      maxTokens: 500,
    })

    let chakraRecommendation: ChakraRecommendation
    try {
      const cleaned = chakraResponse.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      chakraRecommendation = JSON.parse(cleaned)
    } catch (parseError) {
      console.error('Failed to parse Jyotish chakra recommendation:', parseError)
      return reportContent
    }

    // Validate the parsed response has required fields
    if (!chakraRecommendation.chakra || !chakraRecommendation.emotion) {
      console.error('Invalid chakra recommendation structure')
      return reportContent
    }

    // Second call: Blend chakra recommendation into emotional field
    const langInstruction = language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English'

    const hepaticWords = (reportContent.section_7_hepatic ?? '').split(/\s+/).filter(Boolean).length
    const digestiveWords = (reportContent.section_8_digestive_intestinal ?? '').split(/\s+/).filter(Boolean).length
    const wordLimit = Math.min(hepaticWords, digestiveWords)

    const blendPrompt = `CURRENT EMOTIONAL FIELD SECTION:
${reportContent.section_2_emotional_field}

CHAKRA TO INTEGRATE:
${chakraRecommendation.chakra} Chakra
Emotional quality: ${chakraRecommendation.emotion}

WORD COUNT LIMIT: ${wordLimit > 0 ? wordLimit : 120} words maximum (must not exceed the shorter of the hepatic or digestive sections).

Rewrite the emotional field section integrating the chakra insight. Rules:
1. Keep the original clinical iridology findings intact.
2. Translate the chakra insight into nervous system and emotional body language only — never mention Jyotish, astrology, planets, houses, or any astrological term. If a sentence cannot be expressed as a physiological or behavioral pattern, discard it.
3. Include exactly this sentence once, verbatim format: "It is recommended to work on the ${chakraRecommendation.chakra} chakra and the inner work of ${chakraRecommendation.emotion}."
4. Stay within the word count limit.
5. Write in plain prose paragraphs — no bullet points or symbols.

Respond with ONLY the rewritten emotional field text, no additional commentary. Write in ${langInstruction}.`

    const blendResponse = await provider.complete({
      systemPrompt: `You are a clinical iridologist enhancing an emotional field section. Never mention Jyotish, astrology, planets, or houses. Translate all inputs into nervous system and emotional body language only. Write in a clinical, professional tone using full paragraphs. Always respond in ${langInstruction}.`,
      userText: blendPrompt,
      images: [],
      maxTokens: 1000,
    })

    if (!blendResponse.text || blendResponse.text.trim().length === 0) {
      console.error('Blending response is empty')
      return reportContent
    }

    // Return updated report with modified emotional field
    return {
      ...reportContent,
      section_2_emotional_field: blendResponse.text.trim(),
    }
  } catch (error) {
    console.error('Error enhancing emotional field with Jyotish:', error)
    return reportContent
  }
}
