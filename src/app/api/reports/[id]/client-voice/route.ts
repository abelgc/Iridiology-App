import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { rewriteReportForClient, firstNameFrom } from '@/lib/client/writing-pipeline'
import {
  PRACTITIONER_ONLY_SECTION_KEYS,
  REPORT_SECTION_I18N_KEYS,
  getOrderedSectionKeys,
  type ReportContent,
} from '@/types/report'
import { t, type TranslationKey } from '@/lib/i18n'
import { withTimeout } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 300

function stripPractitionerOnly(content: ReportContent): ReportContent {
  const copy = { ...content }
  for (const key of PRACTITIONER_ONLY_SECTION_KEYS) delete copy[key]
  return copy
}

function toMarkdown(content: ReportContent, lang: 'en' | 'es' | 'de'): string {
  return getOrderedSectionKeys(content)
    .map((key) => {
      const i18nKey = REPORT_SECTION_I18N_KEYS[key as keyof typeof REPORT_SECTION_I18N_KEYS] as
        | TranslationKey
        | undefined
      const title = i18nKey ? t(lang, i18nKey) : key
      return `## ${title}\n\n${content[key]}`
    })
    .join('\n\n')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const lang = (body as { lang?: string })?.lang
  const fullName = (body as { fullName?: string })?.fullName ?? null
  if (lang !== 'en' && lang !== 'es' && lang !== 'de') {
    return NextResponse.json({ error: 'invalid_lang' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: report, error } = await supabase
    .from('reports')
    .select('id, report_content, client_report_translations')
    .eq('id', id)
    .single()

  if (error || !report) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 })
  }

  const existingTranslations = (report.client_report_translations ?? {}) as Record<string, ReportContent>
  const cached = existingTranslations[lang]

  let clientContent: ReportContent
  try {
    if (cached) {
      clientContent = cached
    } else {
      const source = stripPractitionerOnly(report.report_content as ReportContent)
      clientContent = await withTimeout(
        rewriteReportForClient(source, lang, firstNameFrom(fullName)),
        200_000,
        'rewrite_timeout_exceeded',
      )

      const { error: cacheError } = await supabase
        .from('reports')
        .update({ client_report_translations: { ...existingTranslations, [lang]: clientContent } })
        .eq('id', id)
      if (cacheError) {
        console.error('[practitioner-client-voice] failed to persist cache:', cacheError)
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'rewrite_failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ markdown: toMarkdown(clientContent, lang) })
}
