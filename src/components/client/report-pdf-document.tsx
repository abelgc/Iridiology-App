import path from 'path'
import { readFileSync } from 'fs'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  StyleSheet,
} from '@react-pdf/renderer'
import type { ReportContent, ReportSectionKey } from '@/types/report'
import { REPORT_SECTION_KEYS, REPORT_SECTION_I18N_KEYS } from '@/types/report'
import { translations } from '@/lib/i18n'
import type { Lang } from '@/lib/i18n'
import { consolidateRecommendationsForTier } from '@/lib/client/filter-recommendations'

// The brand palette, lifted from the web report so the PDF and the screen are
// recognisably the same document. Values are the literals used in globals.css and
// the report page — not the oklch design tokens, which that route overrides.
const CREAM = '#f4ead8' // page background
const CARD = '#f8f0df' // panel behind the report body
const INK = '#2a1f14' // body copy
const DEEP_GREEN = '#2a3520' // title and section headings
const OLIVE = '#3d4a2a' // brand name
const MUTED = '#5d4f3f' // meta and secondary text
const FAINT = '#9c8272' // footer
const ACCENT = '#a85428' // section ordinals, italics
const GOLD = '#c9943a' // plan pill
const RING = '#d4a04a' // ring around the logo
const BORDER = '#d8c9ad' // primary rules
const RULE = '#e6d9bf' // hairline under each section heading

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')

// Read as a Buffer, not handed over as a path: react-pdf treats a bare string src as
// a URL and tries to fetch it, which fails silently server-side ("fetch failed") and
// produces a report with no logo rather than an error. Memoised so a batch of reports
// hits the disk once, and guarded so a missing file costs the logo, not the PDF.
let logoBuffer: Buffer | null | undefined
function getLogo(): Buffer | null {
  if (logoBuffer === undefined) {
    try {
      logoBuffer = readFileSync(path.join(process.cwd(), 'public', 'logo-solutions.png'))
    } catch {
      logoBuffer = null
    }
  }
  return logoBuffer
}

// Registered once at module load. These are static instances generated from the
// Google variable fonts: @react-pdf/renderer silently ignores the weight axis of a
// variable font — verified, 400 and 700 rendered byte-identical — and it resolves
// weights by the font's internal name, so each instance also needs its own name
// record or every weight collapses onto the first one registered.
Font.register({
  family: 'DM Sans',
  fonts: [
    { src: path.join(FONT_DIR, 'DMSans-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'DMSans-SemiBold.ttf'), fontWeight: 600 },
    { src: path.join(FONT_DIR, 'DMSans-Bold.ttf'), fontWeight: 700 },
    // The disclaimer is italic on the web. react-pdf has no synthetic obliquing —
    // an unregistered style is a hard error, not a fallback.
    { src: path.join(FONT_DIR, 'DMSans-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
  ],
})
Font.register({
  family: 'Cormorant Garamond',
  fonts: [{ src: path.join(FONT_DIR, 'CormorantGaramond-Medium.ttf'), fontWeight: 500 }],
})

// Long clinical words (organ names, compound German nouns) would otherwise force
// react-pdf to overflow the line box rather than break.
Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: {
    backgroundColor: CREAM,
    fontFamily: 'DM Sans',
    fontSize: 10.5,
    color: INK,
    paddingTop: 44,
    paddingBottom: 52, // room for the fixed footer
    paddingHorizontal: 40,
  },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  logo: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: RING },
  brandName: { fontFamily: 'Cormorant Garamond', fontSize: 14, color: OLIVE },
  brandSub: { fontSize: 6.5, color: MUTED, letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 1 },
  brandRule: { borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 20 },

  title: { fontFamily: 'Cormorant Garamond', fontSize: 30, color: DEEP_GREEN, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  meta: { fontSize: 9, color: MUTED },
  // borderRadius is a View property in react-pdf, so the pill is a wrapper, not styled text.
  pill: { backgroundColor: GOLD, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7 },
  pillText: { fontSize: 7.5, fontWeight: 700, color: '#ffffff', letterSpacing: 0.3 },

  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 26,
    paddingHorizontal: 22,
  },

  // marginTop gives a section that lands at the top of a fresh page room to breathe;
  // on page one the heading already sits below the title block, so the extra space
  // there is harmless.
  section: { marginBottom: 18, marginTop: 4 },
  headingRow: {
    flexDirection: 'row',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    paddingBottom: 6,
    marginBottom: 9,
  },
  // No baseline alignment in react-pdf's flexbox, so the ordinal is nudged down by
  // hand to sit on the same optical line as the serif heading.
  ordinal: { fontSize: 8, fontWeight: 600, color: ACCENT, letterSpacing: 1.4, marginTop: 5 },
  heading: { fontFamily: 'Cormorant Garamond', fontSize: 17, color: DEEP_GREEN, flex: 1 },

  paragraph: { lineHeight: 1.6, marginBottom: 7, color: INK },
  bulletRow: { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
  bulletDot: { width: 10, color: '#5a6e3a' },
  bulletText: { flex: 1, lineHeight: 1.55, color: INK },
  bold: { fontWeight: 600 },

  disclaimer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderTopStyle: 'dashed',
  },
  disclaimerText: { fontSize: 8, lineHeight: 1.5, color: MUTED, fontStyle: 'italic' },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7.5, color: FAINT },
})

/**
 * Renders the small slice of Markdown that actually appears in report bodies:
 * `**bold**` runs and `- ` bullets. The web path pipes this through ReactMarkdown;
 * the PDF used to dump the raw string into a single <Text>, so clients received a
 * document with literal `**Vitamins**` and `- ` markers in it. There is no Markdown
 * renderer for @react-pdf/renderer, and pulling one in for two constructs would cost
 * more than it returns.
 */
export type MarkdownRun = { text: string; bold: boolean }
export type MarkdownBlock = { type: 'paragraph' | 'bullet'; runs: MarkdownRun[] }

/** Splits a line into plain and `**bold**` runs. */
function splitBold(text: string): MarkdownRun[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part !== '')
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    )
}

/**
 * Kept pure and separate from rendering so it can be tested without building a PDF.
 * Blank lines end a paragraph; consecutive non-blank lines join with a space, matching
 * how Markdown treats a soft wrap.
 */
export function parseMarkdownBlocks(body: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length === 0) return
    blocks.push({ type: 'paragraph', runs: splitBold(paragraph.join(' ')) })
    paragraph = []
  }

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (line === '') {
      flush()
      continue
    }
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      flush()
      blocks.push({ type: 'bullet', runs: splitBold(bullet[1]) })
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

function Runs({ runs }: { runs: MarkdownRun[] }) {
  return (
    <>
      {runs.map((run, i) =>
        run.bold ? (
          <Text key={i} style={styles.bold}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </>
  )
}

function Block({ block, index }: { block: MarkdownBlock; index: number }) {
  return block.type === 'bullet' ? (
    <View key={index} style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>
        <Runs runs={block.runs} />
      </Text>
    </View>
  ) : (
    <Text key={index} style={styles.paragraph}>
      <Runs runs={block.runs} />
    </Text>
  )
}

interface Props {
  report: ReportContent
  generatedAt: string
  lang: Lang
  isPremium?: boolean
}

export function ReportPdfDocument({ report, generatedAt, lang, isPremium = false }: Props) {
  // Section labels are looked up by a key computed at runtime from REPORT_SECTION_KEYS,
  // so this cannot be indexed by the literal union `translations` infers. Widening to a
  // string map here beats an `any` cast, and the English fallback covers a key that a
  // translation is missing.
  const dict = translations as Record<Lang, Record<string, string>>
  const tl = (key: string): string => dict[lang]?.[key] ?? dict.en[key] ?? key
  const logo = getLogo()

  // Match the web, which numbers off the sections that actually have content rather
  // than off all fourteen — otherwise an empty section leaves a gap in the sequence.
  const sections = REPORT_SECTION_KEYS.map((key: ReportSectionKey) => ({
    key,
    body:
      key === 'section_14_recommendations'
        ? consolidateRecommendationsForTier(report[key], isPremium)
        : report[key],
  })).filter((s) => typeof s.body === 'string' && s.body.trim().length > 0)

  return (
    <Document
      title={tl('reportTitle')}
      author="Narasimha Solutions"
      subject={tl('reportTitle')}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- this is react-pdf's Image
              primitive, not an HTML <img>; it has no alt prop and a PDF has no
              screen-reader alternative-text slot here. */}
          {logo ? <Image src={logo} style={styles.logo} /> : null}
          <View>
            <Text style={styles.brandName}>Narasimha Solutions</Text>
            <Text style={styles.brandSub}>Iris Reading</Text>
          </View>
        </View>
        <View style={styles.brandRule} />

        <Text style={styles.title}>{tl('reportTitle')}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {tl('reportMetaGenerated')} {generatedAt}
          </Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              {isPremium ? tl('reportPlanPremium') : tl('reportPlanBasic')}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          {sections.map((s, idx) => {
            const blocks = parseMarkdownBlocks(s.body)
            const [first, ...rest] = blocks
            return (
              <View key={s.key} style={styles.section}>
                {/* The heading and its first block are glued together with wrap={false},
                    so a heading can never be left stranded at the foot of a page with its
                    text overleaf — reported on a real report, 2026-07-27. minPresenceAhead
                    alone did not hold: it reserves space but does not bind the two.
                    Only the first block is glued; the rest wraps freely, so a long section
                    still flows across pages instead of being clipped. */}
                <View wrap={false}>
                  <View style={styles.headingRow}>
                    <Text style={styles.ordinal}>{String(idx + 1).padStart(2, '0')}</Text>
                    <Text style={styles.heading}>{tl(REPORT_SECTION_I18N_KEYS[s.key])}</Text>
                  </View>
                  {first ? <Block block={first} index={0} /> : null}
                </View>
                {rest.map((block, i) => (
                  <Block key={i + 1} block={block} index={i + 1} />
                ))}
              </View>
            )
          })}

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>{tl('reportDisclaimerText')}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{tl('reportFooter')}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
