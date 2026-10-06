import type { Dosha, DoshaCount } from './score'

export const DOSHA_QUIZ_STORAGE_KEY = 'narasimha.doshaQuiz'
export const VIKRITI_HISTORY_CAP = 12

export type StoredPart = {
  answers: Dosha[]
  counts: DoshaCount
  dominant: string
  savedAt: string
}

export type DoshaQuizRecord = {
  prakriti: StoredPart | null
  vikriti: StoredPart | null
  vikritiHistory: StoredPart[]
}

type ReadStore = Pick<Storage, 'getItem'>
type WriteStore = Pick<Storage, 'setItem'>
type ClearStore = Pick<Storage, 'removeItem'>

export function emptyDoshaQuizRecord(): DoshaQuizRecord {
  return { prakriti: null, vikriti: null, vikritiHistory: [] }
}

export function readDoshaQuiz(storage: ReadStore): DoshaQuizRecord {
  const raw = storage.getItem(DOSHA_QUIZ_STORAGE_KEY)
  if (!raw) return emptyDoshaQuizRecord()
  try {
    const parsed = JSON.parse(raw) as Partial<DoshaQuizRecord>
    return {
      prakriti: parsed.prakriti ?? null,
      vikriti: parsed.vikriti ?? null,
      vikritiHistory: Array.isArray(parsed.vikritiHistory)
        ? parsed.vikritiHistory.slice(0, VIKRITI_HISTORY_CAP)
        : [],
    }
  } catch {
    return emptyDoshaQuizRecord()
  }
}

export function writeDoshaQuiz(storage: WriteStore, record: DoshaQuizRecord): void {
  storage.setItem(DOSHA_QUIZ_STORAGE_KEY, JSON.stringify(record))
}

export function clearDoshaQuiz(storage: ClearStore): void {
  storage.removeItem(DOSHA_QUIZ_STORAGE_KEY)
}

/** Newest Vikriti result first. Older rows past the cap are dropped. */
export function withVikritiResult(record: DoshaQuizRecord, vikriti: StoredPart): DoshaQuizRecord {
  return {
    ...record,
    vikriti,
    vikritiHistory: [vikriti, ...record.vikritiHistory].slice(0, VIKRITI_HISTORY_CAP),
  }
}
