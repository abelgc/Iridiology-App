import { getAIProvider } from '@/lib/ai/get-provider'
import { REPORT_MODIFICATION_SYSTEM_PROMPT, buildReportModificationUserPrompt } from './prompts'
import { reportContentUnionSchema } from '@/lib/validators/report'
import { sanitizeJsonControlCharacters, describeJsonSyntaxError } from './json-repair'
import type { ReportContent } from '@/types/report'
import type { ChangedSection, ReportModificationResult } from '@/types/claude'

export interface ModificationError {
  code: 'modification_failed' | 'validation_failed' | 'invalid_json'
  message: string
}

type ParsedReport =
  | { success: true; content: ReportContent }
  | { success: false; error: ModificationError }

function parseModifiedReport(responseText: string): ParsedReport {
  const cleaned = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const sanitized = sanitizeJsonControlCharacters(cleaned)

  try {
    const parsed = JSON.parse(sanitized)
    const content = reportContentUnionSchema.parse(parsed) as ReportContent
    return { success: true, content }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { success: false, error: { code: 'invalid_json', message: describeJsonSyntaxError(sanitized, error) } }
    }
    return {
      success: false,
      error: {
        code: 'validation_failed',
        message: error instanceof Error ? error.message : 'Response did not match the report schema',
      },
    }
  }
}

export async function proposeReportModification(
  reportContent: ReportContent,
  instruction: string,
): Promise<ReportModificationResult | ModificationError> {
  const provider = await getAIProvider()
  const userText = buildReportModificationUserPrompt(reportContent, instruction)

  let response = await provider.complete({
    systemPrompt: REPORT_MODIFICATION_SYSTEM_PROMPT,
    userText,
    images: [],
    maxTokens: 8192,
  })

  if (response.stopReason === 'max_tokens') {
    response = await provider.complete({
      systemPrompt: REPORT_MODIFICATION_SYSTEM_PROMPT,
      userText,
      images: [],
      maxTokens: 12288,
    })
    if (response.stopReason === 'max_tokens') {
      return {
        code: 'modification_failed',
        message: 'response_too_long: modification response still truncated after increasing token limit',
      }
    }
  }

  const parsed = parseModifiedReport(response.text)
  if (!parsed.success) return parsed.error

  const changedSections: ChangedSection[] = Object.keys(reportContent)
    .filter((key) => reportContent[key] !== parsed.content[key])
    .map((key) => ({ key, before: reportContent[key], after: parsed.content[key] }))

  return { newContent: parsed.content, changedSections }
}
