import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'
import { getAIProvider } from '@/lib/ai/get-provider'
import { sanitizeJsonControlCharacters, describeJsonSyntaxError } from '@/lib/claude/json-repair'
import { PRACTITIONER_ONLY_SECTION_KEYS, type ReportContent } from '@/types/report'
import { consolidateRecommendationsForTier } from '@/lib/client/filter-recommendations'

const LANG_NAMES: Record<string, string> = { en: 'English', es: 'Spanish', de: 'German' }

const SELECT_COLUMNS = `
      language,
      status,
      payment_tier,
      reports:report_id ( id, report_content, client_report_content, client_report_translations )
    `

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  if (!isValidReportToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  let lang: string
  try {
    const body = await request.json()
    lang = body.lang
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (lang !== 'en' && lang !== 'es' && lang !== 'de') {
    return NextResponse.json({ error: 'invalid_lang' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('client_analyses')
    .select(SELECT_COLUMNS)
    .eq('report_download_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (data.status !== 'completed' || !data.reports) {
    return NextResponse.json({ error: 'not_ready', status: data.status }, { status: 409 })
  }

  const reports = data.reports as any
  const original: Record<string, string> = { ...(reports.client_report_content ?? reports.report_content) }
  for (const key of PRACTITIONER_ONLY_SECTION_KEYS) delete original[key]

  // The report's own generation language never needs translating — never calls the AI for this.
  if (lang === data.language) {
    return NextResponse.json({ content: original })
  }

  const cached = reports.client_report_translations?.[lang]
  if (cached) {
    return NextResponse.json({ content: cached })
  }

  // section_14_recommendations always keeps literal English "Vitamins:"/"Minerals:"/"Herbs:"
  // prefixes regardless of report language (see prompts.ts RECOMMENDATIONS section) — that's
  // what consolidateRecommendationsForTier matches on to group items and strip minerals/herbs
  // for the basic tier. Consolidate BEFORE translating so the AI only ever sees (and translates)
  // the already tier-filtered result — translating the raw prefix lines first would risk the
  // model rewording "Vitamins:" and permanently breaking that match for this cached entry,
  // which would silently leak premium-only content to a basic-tier client.
  const isPremium = data.payment_tier === 'premium_19_90'
  const toTranslate: Record<string, string> = { ...original }
  if (toTranslate.section_14_recommendations) {
    toTranslate.section_14_recommendations = consolidateRecommendationsForTier(
      toTranslate.section_14_recommendations,
      isPremium,
    )
  }

  const targetLangName = LANG_NAMES[lang]
  const systemPrompt = `You are a professional translator working on a client-facing wellness report (an iridology reading written in plain, warm, non-clinical language for the general public).

Translate the JSON values into ${targetLangName}.

RULES:
- Translate ONLY the values in the JSON, never the keys.
- Preserve all Markdown formatting (**, ##, tables, bullet points, line breaks).
- Preserve the warm, plain-language tone of the original — do not make it more clinical.
- Return ONLY a valid JSON object with the same keys. No extra text, no markdown code fences.`

  let sanitized = ''
  try {
    const provider = await getAIProvider()
    const userText = JSON.stringify(toTranslate)
    let response = await provider.complete({ systemPrompt, userText, images: [], maxTokens: 8192 })

    if (response.stopReason === 'max_tokens') {
      response = await provider.complete({ systemPrompt, userText, images: [], maxTokens: 12288 })
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

    // Best-effort cache write: a rare, concurrent first-time translation into a DIFFERENT
    // language could race and clobber this write in the cache column — accepted, since the
    // only cost is that language re-translating on its next request, and this must never turn
    // a successful translation into an error for the person waiting on it.
    const mergedTranslations = { ...(reports.client_report_translations ?? {}), [lang]: translated }
    const { error: cacheError } = await supabase
      .from('reports')
      .update({ client_report_translations: mergedTranslations })
      .eq('id', reports.id)
    if (cacheError) {
      console.error('[client-translate] failed to persist translation cache:', cacheError)
    }

    return NextResponse.json({ content: translated })
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('[client-translate] JSON parse failed:', describeJsonSyntaxError(sanitized, err))
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Translation failed' },
      { status: 500 },
    )
  }
}
