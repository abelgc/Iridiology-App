import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { ReportContent, ReportSectionKey } from '@/types/report'
import { REPORT_SECTION_KEYS, REPORT_SECTION_I18N_KEYS } from '@/types/report'
import { translations } from '@/lib/i18n'
import type { Lang } from '@/lib/i18n'
import { consolidateRecommendationsForTier } from '@/lib/client/filter-recommendations'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    color: '#1a1a1a',
  },
  header: {
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    color: '#2c3e50',
  },
  sectionBody: {
    lineHeight: 1.6,
    color: '#333',
  },
})

interface Props {
  report: ReportContent
  generatedAt: string
  lang: Lang
  isPremium?: boolean
}

export function ReportPdfDocument({ report, generatedAt, lang, isPremium = false }: Props) {
  const tl = (key: string): string =>
    (translations[lang] as any)[key] ?? (translations.en as any)[key] ?? key

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{tl('pdfReportTitle')}</Text>
          <Text style={styles.subtitle}>{tl('pdfGenerated')} {generatedAt}</Text>
        </View>

        {REPORT_SECTION_KEYS.map((key: ReportSectionKey) => {
          const body =
            key === 'section_14_recommendations'
              ? consolidateRecommendationsForTier(report[key], isPremium)
              : report[key]
          return (
            <View key={key} style={styles.section}>
              <Text style={styles.sectionTitle}>{tl(REPORT_SECTION_I18N_KEYS[key])}</Text>
              <Text style={styles.sectionBody}>{body}</Text>
            </View>
          )
        })}
      </Page>
    </Document>
  )
}
