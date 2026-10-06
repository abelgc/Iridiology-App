import { describe, it, expect } from 'vitest'
import {
  countDoshas,
  sharesFromCounts,
  dominantDoshas,
  elevatedDoshas,
  scoreQuiz,
  formatDominant,
} from '@/lib/dosha/score'
import type { Dosha } from '@/lib/dosha/score'

function answers(spec: Partial<Record<Dosha, number>>): Dosha[] {
  const out: Dosha[] = []
  for (const dosha of ['vata', 'pitta', 'kapha'] as const) {
    for (let i = 0; i < (spec[dosha] ?? 0); i++) out.push(dosha)
  }
  return out
}

describe('dosha score', () => {
  it('counts answers per dosha and turns an all-vata part into 100 / 0 / 0, single Vata', () => {
    const counts = countDoshas(answers({ vata: 20 }))
    expect(counts).toEqual({ vata: 20, pitta: 0, kapha: 0 })
    const shares = sharesFromCounts(counts)
    expect(shares).toEqual({ vata: 100, pitta: 0, kapha: 0 })
    expect(formatDominant(dominantDoshas(shares))).toBe('Vata')
  })

  it('calls the top two a dual constitution when they are within 10 points, higher dosha first', () => {
    const within = sharesFromCounts(countDoshas(answers({ vata: 11, pitta: 9 })))
    expect(within).toEqual({ vata: 55, pitta: 45, kapha: 0 })
    expect(formatDominant(dominantDoshas(within))).toBe('Vata-Pitta')

    const pittaLeads = sharesFromCounts(countDoshas(answers({ pitta: 11, vata: 9 })))
    expect(formatDominant(dominantDoshas(pittaLeads))).toBe('Pitta-Vata')
  })

  it('keeps a single dominant dosha when the runner-up is more than 10 points behind', () => {
    const shares = sharesFromCounts(countDoshas(answers({ vata: 12, pitta: 8 })))
    expect(shares).toEqual({ vata: 60, pitta: 40, kapha: 0 })
    expect(formatDominant(dominantDoshas(shares))).toBe('Vata')
  })

  it('names all three when each is within 10 points of the leader', () => {
    const shares = sharesFromCounts(countDoshas(answers({ vata: 7, pitta: 7, kapha: 6 })))
    expect(shares).toEqual({ vata: 35, pitta: 35, kapha: 30 })
    expect(formatDominant(dominantDoshas(shares))).toBe('Vata-Pitta-Kapha')
  })

  it('rounds shares to integers that sum to 100, giving leftover points by remainder then dosha order', () => {
    const shares = sharesFromCounts(countDoshas(answers({ vata: 1, pitta: 1, kapha: 1 })))
    expect(shares).toEqual({ vata: 34, pitta: 33, kapha: 33 })
    expect(shares.vata + shares.pitta + shares.kapha).toBe(100)
  })

  it('flags a dosha as elevated only when its Vikriti share is at least 10 points above Prakriti', () => {
    const prakriti = { vata: 40, pitta: 40, kapha: 20 }
    expect(elevatedDoshas(prakriti, { vata: 50, pitta: 30, kapha: 20 })).toEqual(['vata'])
    expect(elevatedDoshas(prakriti, { vata: 49, pitta: 31, kapha: 20 })).toEqual([])
  })

  it('lists every elevated dosha, largest rise first', () => {
    const elevated = elevatedDoshas(
      { vata: 50, pitta: 30, kapha: 20 },
      { vata: 20, pitta: 50, kapha: 30 },
    )
    expect(elevated).toEqual(['pitta', 'kapha'])
  })

  it('scores the two parts separately and reports the comparison', () => {
    const result = scoreQuiz(answers({ vata: 20 }), answers({ pitta: 20 }))
    expect(formatDominant(result.prakriti.dominant)).toBe('Vata')
    expect(formatDominant(result.vikriti.dominant)).toBe('Pitta')
    expect(result.prakriti.shares).toEqual({ vata: 100, pitta: 0, kapha: 0 })
    expect(result.vikriti.shares).toEqual({ vata: 0, pitta: 100, kapha: 0 })
    expect(result.elevated).toEqual(['pitta'])
  })

  it('returns zero shares for an empty answer list', () => {
    expect(sharesFromCounts(countDoshas([]))).toEqual({ vata: 0, pitta: 0, kapha: 0 })
  })
})
