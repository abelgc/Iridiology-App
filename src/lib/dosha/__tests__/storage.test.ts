import { describe, it, expect } from 'vitest'
import {
  DOSHA_QUIZ_STORAGE_KEY,
  VIKRITI_HISTORY_CAP,
  clearDoshaQuiz,
  readDoshaQuiz,
  withVikritiResult,
  writeDoshaQuiz,
  type DoshaQuizRecord,
  type StoredPart,
} from '@/lib/dosha/storage'

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

function part(dominant: string, savedAt: string): StoredPart {
  return {
    answers: ['vata'],
    counts: { vata: 1, pitta: 0, kapha: 0 },
    dominant,
    savedAt,
  }
}

describe('dosha quiz storage', () => {
  it('reads an empty record when nothing is saved', () => {
    expect(readDoshaQuiz(memory())).toEqual({
      prakriti: null,
      vikriti: null,
      vikritiHistory: [],
    })
  })

  it('writes and reads the latest result, and clears it', () => {
    const store = memory()
    const record = {
      prakriti: part('Vata', '2026-10-01T00:00:00.000Z'),
      vikriti: part('Pitta', '2026-10-02T00:00:00.000Z'),
      vikritiHistory: [part('Pitta', '2026-10-02T00:00:00.000Z')],
    }
    writeDoshaQuiz(store, record)
    expect(store.getItem(DOSHA_QUIZ_STORAGE_KEY)).toContain('Pitta')
    expect(readDoshaQuiz(store)).toEqual(record)
    clearDoshaQuiz(store)
    expect(readDoshaQuiz(store).vikriti).toBeNull()
  })

  it('keeps Vikriti history newest first and caps it', () => {
    let record: DoshaQuizRecord = { prakriti: null, vikriti: null, vikritiHistory: [] }
    for (let i = 0; i < VIKRITI_HISTORY_CAP + 3; i++) {
      record = withVikritiResult(record, part(`R${i}`, `2026-10-${String(i + 1).padStart(2, '0')}`))
    }
    expect(record.vikritiHistory).toHaveLength(VIKRITI_HISTORY_CAP)
    expect(record.vikritiHistory[0].dominant).toBe(`R${VIKRITI_HISTORY_CAP + 2}`)
    expect(record.vikriti?.dominant).toBe(`R${VIKRITI_HISTORY_CAP + 2}`)
  })

  it('ignores corrupt saved JSON', () => {
    const store = memory()
    store.setItem(DOSHA_QUIZ_STORAGE_KEY, '{not json')
    expect(readDoshaQuiz(store)).toEqual({
      prakriti: null,
      vikriti: null,
      vikritiHistory: [],
    })
  })
})
