export const DOSHAS = ['vata', 'pitta', 'kapha'] as const

export type Dosha = (typeof DOSHAS)[number]

export type DoshaCount = Record<Dosha, number>

/** Integer percentage points per dosha. A part's shares sum to 100 when there is at least one answer. */
export type DoshaShare = Record<Dosha, number>

export const DUAL_MARGIN = 10
export const ELEVATION_MARGIN = 10

const DOSHA_LABEL: Record<Dosha, string> = {
  vata: 'Vata',
  pitta: 'Pitta',
  kapha: 'Kapha',
}

export type Dominant = {
  kind: 'single' | 'dual' | 'tri'
  doshas: Dosha[]
}

export type PartScore = {
  counts: DoshaCount
  shares: DoshaShare
  dominant: Dominant
}

export type QuizScore = {
  prakriti: PartScore
  vikriti: PartScore
  elevated: Dosha[]
}

function zeros(): DoshaCount {
  return { vata: 0, pitta: 0, kapha: 0 }
}

export function countDoshas(answers: readonly Dosha[]): DoshaCount {
  const counts = zeros()
  for (const answer of answers) counts[answer] += 1
  return counts
}

/**
 * Largest-remainder rounding so the three percentages are integers and sum to 100.
 * Ties on the remainder go to Vata, then Pitta, then Kapha.
 */
export function sharesFromCounts(counts: DoshaCount): DoshaShare {
  const total = DOSHAS.reduce((sum, dosha) => sum + counts[dosha], 0)
  if (total === 0) return zeros()

  const parts = DOSHAS.map((dosha) => {
    const exact = (counts[dosha] / total) * 100
    const floor = Math.floor(exact)
    return { dosha, floor, remainder: exact - floor }
  })

  let leftover = 100 - parts.reduce((sum, part) => sum + part.floor, 0)
  const byRemainder = [...parts].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder
    return DOSHAS.indexOf(a.dosha) - DOSHAS.indexOf(b.dosha)
  })

  const bonus = new Set<Dosha>()
  for (const part of byRemainder) {
    if (leftover <= 0) break
    bonus.add(part.dosha)
    leftover -= 1
  }

  const shares = zeros()
  for (const part of parts) {
    shares[part.dosha] = part.floor + (bonus.has(part.dosha) ? 1 : 0)
  }
  return shares
}

function ranked(shares: DoshaShare): Dosha[] {
  return [...DOSHAS].sort((a, b) => {
    if (shares[b] !== shares[a]) return shares[b] - shares[a]
    return DOSHAS.indexOf(a) - DOSHAS.indexOf(b)
  })
}

/** Top dosha, or the top two (or all three) when they sit within `margin` percentage points of the leader. */
export function dominantDoshas(shares: DoshaShare, margin = DUAL_MARGIN): Dominant {
  const [first, second, third] = ranked(shares)
  const closeToLeader = (dosha: Dosha) => shares[first] - shares[dosha] <= margin

  if (closeToLeader(second) && closeToLeader(third)) {
    return { kind: 'tri', doshas: [first, second, third] }
  }
  if (closeToLeader(second)) {
    return { kind: 'dual', doshas: [first, second] }
  }
  return { kind: 'single', doshas: [first] }
}

export function formatDominant(dominant: Dominant): string {
  return dominant.doshas.map((dosha) => DOSHA_LABEL[dosha]).join('-')
}

/** A dosha whose Vikriti share exceeds its Prakriti share by at least `margin` points. Largest rise first. */
export function elevatedDoshas(
  prakriti: DoshaShare,
  vikriti: DoshaShare,
  margin = ELEVATION_MARGIN,
): Dosha[] {
  return DOSHAS.filter((dosha) => vikriti[dosha] - prakriti[dosha] >= margin).sort((a, b) => {
    const rise = vikriti[b] - prakriti[b] - (vikriti[a] - prakriti[a])
    if (rise !== 0) return rise
    return DOSHAS.indexOf(a) - DOSHAS.indexOf(b)
  })
}

export function scorePart(answers: readonly Dosha[]): PartScore {
  const counts = countDoshas(answers)
  const shares = sharesFromCounts(counts)
  return { counts, shares, dominant: dominantDoshas(shares) }
}

export function scoreQuiz(prakritiAnswers: readonly Dosha[], vikritiAnswers: readonly Dosha[]): QuizScore {
  const prakriti = scorePart(prakritiAnswers)
  const vikriti = scorePart(vikritiAnswers)
  return {
    prakriti,
    vikriti,
    elevated: elevatedDoshas(prakriti.shares, vikriti.shares),
  }
}
