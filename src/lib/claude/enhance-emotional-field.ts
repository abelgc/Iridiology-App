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
  language: 'en' | 'es' = 'es',
): Promise<ReportContent> {
  try {
    const provider = await getAIProvider()

    const chakraPrompt = `Patient: ${patientName}
Date of Birth: ${astrologyData.date_of_birth}
Place of Birth: ${astrologyData.city_of_birth}, ${astrologyData.country_of_birth}
Time of Day: ${astrologyData.time_of_day}

Based on this birth data, recommend the primary chakra and main emotion to focus on for emotional healing. Respond in ${language === 'en' ? 'English' : 'Spanish'}.`

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
    const langInstruction = language === 'en' ? 'English' : 'Spanish'
    const blendPrompt = `You are an expert iridologist blending Jyotish insights into an existing emotional field analysis.

CURRENT EMOTIONAL FIELD SECTION:
${reportContent.section_2_emotional_field}

JYOTISH RECOMMENDATION:
Chakra: ${chakraRecommendation.chakra}
Emotion/Quality to Cultivate: ${chakraRecommendation.emotion}
Reasoning: ${chakraRecommendation.reasoning}

Enhance the emotional field analysis by thoughtfully integrating the Jyotish chakra recommendation. Your updated section should:
1. Keep the original clinical iridology findings intact
2. Add the chakra insight as a complementary healing perspective
3. Suggest how cultivating the recommended emotion/quality can support the observed emotional patterns
4. Maintain the same clinical, professional tone
5. Write in plain prose paragraphs — no bullet points or symbols

Respond with ONLY the enhanced emotional field text, no additional commentary. Write your response in ${langInstruction}.`

    const blendResponse = await provider.complete({
      systemPrompt: `You are an expert clinical iridologist specializing in integrating Jyotish insights into iridology reports. Write in a clinical, professional tone using full paragraphs. Always respond in ${langInstruction}.`,
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
