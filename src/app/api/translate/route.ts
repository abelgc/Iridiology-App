import { createAdminClient } from '@/lib/supabase/server'
import { getAIProvider } from '@/lib/ai/get-provider'
import { REPORT_SECTION_KEYS, type ReportContent } from '@/types/report'
import { NextRequest, NextResponse } from 'next/server'

const TRANSLATE_SYSTEM_PROMPT = `You are a medical translator specialising in iridology reports. Translate English iridology report content into Spanish.

RULES:
- Translate ONLY the values in the JSON, never the keys.
- Preserve all Markdown formatting (**, ##, tables, bullet points).
- section_13_protocolo_tratamiento must remain an empty string "".
- Return ONLY a valid JSON object with the same 14 keys. No extra text.`

export async function POST(request: NextRequest) {
  try {
    const { reportId } = await request.json()
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

    // Build a compact JSON with only non-empty sections (skip section_13)
    const toTranslate: Partial<ReportContent> = {}
    for (const key of REPORT_SECTION_KEYS) {
      if (key === 'section_13_protocolo_tratamiento') continue
      toTranslate[key] = content[key] || ''
    }

    const provider = await getAIProvider()
    const response = await provider.complete({
      systemPrompt: TRANSLATE_SYSTEM_PROMPT,
      userText: JSON.stringify(toTranslate),
      images: [],
      maxTokens: 8192,
    })

    const cleaned = response.text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const translated = JSON.parse(cleaned) as Partial<ReportContent>
    // section_13 always empty
    translated['section_13_protocolo_tratamiento'] = ''

    return NextResponse.json({ content: translated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Translation failed' },
      { status: 500 },
    )
  }
}
