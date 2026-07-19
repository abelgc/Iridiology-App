import { createAdminClient } from '@/lib/supabase/server'
import { getAIProvider } from '@/lib/ai/get-provider'
import { sanitizeJsonControlCharacters, describeJsonSyntaxError } from '@/lib/claude/json-repair'
import { type ReportContent } from '@/types/report'
import { NextRequest, NextResponse } from 'next/server'

const LANG_NAMES: Record<string, string> = { es: 'Spanish', de: 'German' }

export async function POST(request: NextRequest) {
  let sanitized = ''
  try {
    const { reportId, targetLang = 'es' } = await request.json()
    const targetLangName = LANG_NAMES[targetLang] ?? 'Spanish'
    const TRANSLATE_SYSTEM_PROMPT = `You are a medical translator specialising in iridology reports. Translate English iridology report content into ${targetLangName}.

RULES:
- Translate ONLY the values in the JSON, never the keys.
- Preserve all Markdown formatting (**, ##, tables, bullet points).
- Return ONLY a valid JSON object with the same keys. No extra text.`
    if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: report, error } = await supabase
      .from('reports')
      .select('report_content')
      .eq('id', reportId)
      .single()

    if (error || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const content = report.report_content as ReportContent

    // Build a compact JSON with the report's own section keys (standard or comparison)
    const toTranslate: Record<string, string> = {}
    for (const key of Object.keys(content)) {
      toTranslate[key] = content[key] || ''
    }

    const provider = await getAIProvider()
    const translateUserText = JSON.stringify(toTranslate)
    let response = await provider.complete({
      systemPrompt: TRANSLATE_SYSTEM_PROMPT,
      userText: translateUserText,
      images: [],
      maxTokens: 8192,
    })

    if (response.stopReason === 'max_tokens') {
      response = await provider.complete({
        systemPrompt: TRANSLATE_SYSTEM_PROMPT,
        userText: translateUserText,
        images: [],
        maxTokens: 12288,
      })
      if (response.stopReason === 'max_tokens') {
        return NextResponse.json(
          { error: 'response_too_long: translation response still truncated after increasing token limit' },
          { status: 500 },
        )
      }
    }

    const cleaned = response.text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    sanitized = sanitizeJsonControlCharacters(cleaned)
    const translated = JSON.parse(sanitized) as Partial<ReportContent>

    return NextResponse.json({ content: translated })
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('[translate] JSON parse failed:', describeJsonSyntaxError(sanitized, err))
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Translation failed' },
      { status: 500 },
    )
  }
}
