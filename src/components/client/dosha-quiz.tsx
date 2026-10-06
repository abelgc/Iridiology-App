'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n-context'
import { DOSHA_QUESTIONS, localize } from '@/lib/dosha/questions'
import {
  DOSHAS,
  countDoshas,
  dominantDoshas,
  formatDominant,
  scoreQuiz,
  sharesFromCounts,
  type Dosha,
  type DoshaShare,
} from '@/lib/dosha/score'
import { PART_FRAME, doshaName, quizCopy } from '@/lib/dosha/copy'
import {
  clearDoshaQuiz,
  readDoshaQuiz,
  withVikritiResult,
  writeDoshaQuiz,
  type DoshaQuizRecord,
  type StoredPart,
} from '@/lib/dosha/storage'

const TOTAL = DOSHA_QUESTIONS.length

const BAR: Record<Dosha, string> = {
  vata: '#d4a04a',
  pitta: '#c66a3d',
  kapha: '#3d4a2a',
}

type Part = 'prakriti' | 'vikriti'

function blank(): (Dosha | null)[] {
  return Array.from({ length: TOTAL }, () => null)
}

function filled(answers: (Dosha | null)[]): Dosha[] | null {
  if (answers.some((answer) => answer === null)) return null
  return answers as Dosha[]
}

function snapshot(answers: Dosha[]): StoredPart {
  const counts = countDoshas(answers)
  const shares = sharesFromCounts(counts)
  return {
    answers,
    counts,
    dominant: formatDominant(dominantDoshas(shares)),
    savedAt: new Date().toISOString(),
  }
}

export function DoshaQuiz() {
  const { lang, t } = useLanguage()
  const copy = quizCopy(lang)
  const [part, setPart] = useState<Part | 'results'>('prakriti')
  const [index, setIndex] = useState(0)
  const [prakriti, setPrakriti] = useState<(Dosha | null)[]>(blank)
  const [vikriti, setVikriti] = useState<(Dosha | null)[]>(blank)
  const [saved, setSaved] = useState<DoshaQuizRecord | null>(null)

  useEffect(() => {
    const record = readDoshaQuiz(window.localStorage)
    // Saved answers live in this browser. Reading them during render would
    // disagree with the server HTML, so the update happens after mount.
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is read once after mount */
    setSaved(record)
    if (record.prakriti && record.vikriti) {
      setPrakriti(pad(record.prakriti.answers))
      setVikriti(pad(record.vikriti.answers))
      setPart('results')
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (/jsdom/i.test(navigator.userAgent)) return
    window.scrollTo(0, 0)
  }, [part, index])

  const result = useMemo(() => {
    const life = filled(prakriti)
    const recent = filled(vikriti)
    if (!life || !recent) return null
    return scoreQuiz(life, recent)
  }, [prakriti, vikriti])

  function persist(nextPrakriti: (Dosha | null)[], nextVikriti: (Dosha | null)[], which: Part) {
    const life = filled(nextPrakriti)
    const recent = filled(nextVikriti)
    let record = readDoshaQuiz(window.localStorage)
    if (which === 'prakriti' && life) record = { ...record, prakriti: snapshot(life) }
    if (which === 'vikriti' && recent) record = withVikritiResult(record, snapshot(recent))
    writeDoshaQuiz(window.localStorage, record)
    setSaved(record)
  }

  function choose(dosha: Dosha) {
    if (part === 'results') return
    const current = part === 'prakriti' ? prakriti : vikriti
    const next = current.slice()
    next[index] = dosha
    const nextPrakriti = part === 'prakriti' ? next : prakriti
    const nextVikriti = part === 'vikriti' ? next : vikriti
    if (part === 'prakriti') setPrakriti(next)
    else setVikriti(next)

    if (index < TOTAL - 1) {
      setIndex(index + 1)
      return
    }
    persist(nextPrakriti, nextVikriti, part)
    if (part === 'prakriti') {
      setPart('vikriti')
      setIndex(0)
      return
    }
    setPart('results')
  }

  function back() {
    if (part === 'results') {
      setPart('vikriti')
      setIndex(TOTAL - 1)
      return
    }
    if (index > 0) {
      setIndex(index - 1)
      return
    }
    if (part === 'vikriti') {
      setPart('prakriti')
      setIndex(TOTAL - 1)
    }
  }

  function retake(which: Part) {
    if (which === 'prakriti') {
      setPrakriti(blank())
      setPart('prakriti')
    } else {
      setVikriti(blank())
      setPart('vikriti')
    }
    setIndex(0)
  }

  function viewResults() {
    const record = readDoshaQuiz(window.localStorage)
    if (!record.prakriti || !record.vikriti) return
    setPrakriti(pad(record.prakriti.answers))
    setVikriti(pad(record.vikriti.answers))
    setSaved(record)
    setPart('results')
  }

  function clearSaved() {
    clearDoshaQuiz(window.localStorage)
    setSaved(null)
    setPrakriti(blank())
    setVikriti(blank())
    setPart('prakriti')
    setIndex(0)
  }

  if (part === 'results' && result) {
    return (
      <Results
        copy={copy}
        disclaimer={t('disclaimer')}
        lang={lang}
        prakritiLabel={formatDominant(result.prakriti.dominant)}
        vikritiLabel={formatDominant(result.vikriti.dominant)}
        prakritiLines={result.prakriti.dominant.doshas.map((dosha) => copy.doshaLine[dosha])}
        vikritiLines={result.vikriti.dominant.doshas.map((dosha) => copy.doshaLine[dosha])}
        prakritiShares={result.prakriti.shares}
        vikritiShares={result.vikriti.shares}
        elevated={result.elevated}
        saved={saved}
        onBack={back}
        onRetake={retake}
        onView={viewResults}
        onClear={clearSaved}
      />
    )
  }

  const questionPart: Part = part === 'vikriti' ? 'vikriti' : 'prakriti'
  const question = DOSHA_QUESTIONS[index]
  const selected = (questionPart === 'prakriti' ? prakriti : vikriti)[index]
  const atStart = questionPart === 'prakriti' && index === 0

  return (
    <section style={{ padding: '28px 16px 48px', maxWidth: '560px', margin: '0 auto' }}>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={TOTAL}
        aria-valuenow={index + 1}
        aria-label={copy.questionOf(index + 1, TOTAL)}
        style={{ height: '3px', background: '#e4d5bc', borderRadius: '99px', marginBottom: '18px' }}
      >
        <div style={{ width: `${((index + 1) / TOTAL) * 100}%`, height: '100%', background: '#3d4a2a', borderRadius: '99px' }} />
      </div>

      <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: '15px', color: '#3d4a2a' }}>
        {copy.partName[questionPart]}
        <span style={{ color: '#8a7560' }}> · {copy.questionOf(index + 1, TOTAL)}</span>
      </p>
      <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#5d4f3f', lineHeight: 1.5 }}>{PART_FRAME[questionPart][lang]}</p>
      <p style={{ margin: '0 0 14px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a85428' }}>
        {localize(question.category, lang)}
      </p>

      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'clamp(26px, 6vw, 34px)', lineHeight: 1.15, color: '#2a3520', margin: '0 0 8px' }}>
        {localize(question.prompt, lang)}
      </h1>
      <p style={{ margin: '0 0 18px', fontSize: '14px', color: '#5d4f3f' }}>{copy.helper}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {DOSHAS.map((dosha) => {
          const active = selected === dosha
          return (
            <button
              key={dosha}
              type="button"
              data-dosha={dosha}
              aria-pressed={active}
              onClick={() => choose(dosha)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'left',
                padding: '16px 16px',
                borderRadius: '16px',
                border: active ? '1.5px solid #c66a3d' : '1.5px solid #d8c9ad',
                background: active ? '#f6e0d2' : '#f8f0df',
                color: '#2a1f14',
                fontSize: '15px',
                lineHeight: 1.45,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  border: active ? '5px solid #c66a3d' : '1.5px solid #c4b49a',
                  background: '#f8f0df',
                  boxSizing: 'border-box',
                }}
              />
              {localize(question.options[dosha], lang)}
            </button>
          )
        })}
      </div>

      <button type="button" onClick={back} disabled={atStart} style={{ ...textButton, opacity: atStart ? 0.4 : 1 }}>
        {copy.back}
      </button>
    </section>
  )
}

function pad(answers: Dosha[]): (Dosha | null)[] {
  const next = blank()
  answers.forEach((answer, i) => {
    if (i < next.length) next[i] = answer
  })
  return next
}

function Results({
  copy,
  disclaimer,
  lang,
  prakritiLabel,
  vikritiLabel,
  prakritiLines,
  vikritiLines,
  prakritiShares,
  vikritiShares,
  elevated,
  saved,
  onBack,
  onRetake,
  onView,
  onClear,
}: {
  copy: ReturnType<typeof quizCopy>
  disclaimer: string
  lang: 'en' | 'es' | 'de'
  prakritiLabel: string
  vikritiLabel: string
  prakritiLines: string[]
  vikritiLines: string[]
  prakritiShares: DoshaShare
  vikritiShares: DoshaShare
  elevated: Dosha[]
  saved: DoshaQuizRecord | null
  onBack: () => void
  onRetake: (part: Part) => void
  onView: () => void
  onClear: () => void
}) {
  const history = saved?.vikritiHistory ?? []
  const locale = lang === 'de' ? 'de-DE' : lang === 'es' ? 'es-ES' : 'en-GB'

  return (
    <section style={{ padding: '28px 16px 48px', maxWidth: '560px', margin: '0 auto' }}>
      <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a85428' }}>
        {copy.resultsEyebrow}
      </p>
      <h1 style={heroTitle}>{copy.resultsTitle}</h1>
      <p style={{ margin: '12px 0 22px', fontSize: '15px', lineHeight: 1.6, color: '#5d4f3f' }}>{copy.resultsLead}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <ScoreCard label={copy.prakritiCard} dominant={prakritiLabel} lines={prakritiLines} shares={prakritiShares} />
        <ScoreCard label={copy.vikritiCard} dominant={vikritiLabel} lines={vikritiLines} shares={vikritiShares} />
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h2 style={cardTitle}>{copy.whatChanged}</h2>
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6, color: '#5d4f3f' }}>
          {elevated.length === 0 ? copy.balanced : copy.elevated(elevated)}
        </p>
      </div>

      <Link href="/" className="cta-premium" style={{ textDecoration: 'none', marginTop: '22px' }}>
        {copy.cta}
      </Link>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '18px' }}>
        <button type="button" onClick={() => onRetake('prakriti')} style={outlineButton}>{copy.retakePrakriti}</button>
        <button type="button" onClick={() => onRetake('vikriti')} style={outlineButton}>{copy.retakeVikriti}</button>
        <button type="button" onClick={onView} style={outlineButton}>{copy.viewResults}</button>
        <button type="button" onClick={onClear} style={outlineButton}>{copy.clearData}</button>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: '22px' }}>
          <h2 style={cardTitle}>{copy.historyTitle}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#2a1f14' }}>
              <thead>
                <tr>
                  {[copy.colDate, copy.colResult, 'Vata', 'Pitta', 'Kapha'].map((heading) => (
                    <th key={heading} style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #d8c9ad', fontWeight: 600 }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.savedAt + row.dominant}>
                    <td style={cell}>{new Date(row.savedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style={cell}>{row.dominant}</td>
                    <td style={cell}>{row.counts.vata}</td>
                    <td style={cell}>{row.counts.pitta}</td>
                    <td style={cell}>{row.counts.kapha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ margin: '16px 0 0', fontSize: '12px', color: '#8a7560', lineHeight: 1.5 }}>{copy.footnote}</p>

      <button type="button" onClick={onBack} style={textButton}>{copy.back}</button>

      <p style={{ maxWidth: '520px', margin: '22px auto 0', textAlign: 'center', color: '#5d4f3f', fontSize: '11.5px', lineHeight: 1.6, fontStyle: 'italic', opacity: 0.75 }}>
        {disclaimer}
      </p>
    </section>
  )
}

function ScoreCard({
  label,
  dominant,
  lines,
  shares,
}: {
  label: string
  dominant: string
  lines: string[]
  shares: DoshaShare
}) {
  return (
    <div style={card}>
      <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5d4f3f' }}>{label}</p>
      <p style={{ margin: '8px 0 4px', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '32px', lineHeight: 1.1, color: '#a85428' }}>{dominant}</p>
      <p style={{ margin: '0 0 14px', fontSize: '14px', lineHeight: 1.5, color: '#5d4f3f' }}>{lines.join(' ')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {DOSHAS.map((dosha) => (
          <div key={dosha}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#2a1f14', marginBottom: '4px' }}>
              <span>{doshaName(dosha)}</span>
              <span>{shares[dosha]}%</span>
            </div>
            <div style={{ height: '8px', background: '#ecdfc6', borderRadius: '99px' }}>
              <div style={{ width: `${shares[dosha]}%`, height: '100%', background: BAR[dosha], borderRadius: '99px' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const heroTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: 'clamp(32px, 7vw, 44px)',
  lineHeight: 1.05,
  color: '#2a3520',
  letterSpacing: '-0.01em',
  margin: 0,
}

const card: CSSProperties = {
  background: '#f8f0df',
  border: '1px solid #d8c9ad',
  borderRadius: '18px',
  padding: '18px 16px',
}

const cardTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: '22px',
  color: '#2a3520',
  margin: '0 0 8px',
}

const textButton: CSSProperties = {
  marginTop: '16px',
  background: 'none',
  border: 'none',
  color: '#3d4a2a',
  fontSize: '13px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: '8px 0',
}

const outlineButton: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1.5px solid #3d4a2a',
  background: 'transparent',
  color: '#3d4a2a',
  fontFamily: 'inherit',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
}

const cell: CSSProperties = {
  padding: '8px 6px',
  borderBottom: '1px solid #eadfcd',
  whiteSpace: 'nowrap',
}
