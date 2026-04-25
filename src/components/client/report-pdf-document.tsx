import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { ReportContent, ReportSectionKey } from '@/types/report'
import { REPORT_SECTION_KEYS, REPORT_SECTION_LABELS } from '@/types/report'

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
}

export function ReportPdfDocument({ report, generatedAt }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Iridology Analysis Report</Text>
          <Text style={styles.subtitle}>Generated: {generatedAt}</Text>
        </View>

        {REPORT_SECTION_KEYS.map((key: ReportSectionKey) => (
          <View key={key} style={styles.section}>
            <Text style={styles.sectionTitle}>{REPORT_SECTION_LABELS[key]}</Text>
            <Text style={styles.sectionBody}>{report[key]}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
