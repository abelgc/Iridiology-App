'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SECTION_KEYS = [
  'section_1_terreno_general',
  'section_2_campo_emocional',
  'section_3_sistema_nervioso_cognitivo',
  'section_4_sistema_inmunologico_linfatico',
  'section_5_sistema_endocrino_hormonal',
  'section_6_sistema_circulatorio_cardiorrespiratorio',
  'section_7_sistema_hepatico',
  'section_8_sistema_digestivo_intestinal',
  'section_9_sistema_renal_urinario_reproductivo',
  'section_10_sistema_estructural_integumentario',
  'section_11_conclusion',
] as const

type SectionKey = (typeof SECTION_KEYS)[number]

export function ClientReportViewer({
  report,
}: {
  report: Partial<Record<SectionKey, string>>
}) {
  return (
    <article className="prose max-w-none print:prose-sm">
      {SECTION_KEYS.map((key) => {
        const content = report[key]
        if (!content) return null
        return (
          <section key={key} className="mb-8">
            <h2 className="capitalize">{key.replace(/^section_\d+_/, '').replace(/_/g, ' ')}</h2>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </section>
        )
      })}
    </article>
  )
}
