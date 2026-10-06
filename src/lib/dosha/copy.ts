import type { Lang } from '@/lib/i18n'
import { type Dosha } from './score'

const NAME: Record<Dosha, string> = {
  vata: 'Vata',
  pitta: 'Pitta',
  kapha: 'Kapha',
}

export function doshaName(dosha: Dosha): string {
  return NAME[dosha]
}

function joinNames(names: string[], lang: Lang): string {
  const conjunction = lang === 'es' ? 'y' : lang === 'de' ? 'und' : 'and'
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} ${conjunction} ${names[1]}`
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`
}

export type QuizCopy = {
  partName: Record<'prakriti' | 'vikriti', string>
  questionOf: (current: number, total: number) => string
  helper: string
  back: string
  resultsEyebrow: string
  resultsTitle: string
  resultsLead: string
  prakritiCard: string
  vikritiCard: string
  doshaLine: Record<Dosha, string>
  whatChanged: string
  balanced: string
  elevated: (doshas: Dosha[]) => string
  cta: string
  retakePrakriti: string
  retakeVikriti: string
  viewResults: string
  clearData: string
  historyTitle: string
  colDate: string
  colResult: string
  footnote: string
}

const doshaLine: Record<Lang, Record<Dosha, string>> = {
  en: {
    vata: 'Lightness, change, and quick movement.',
    pitta: 'Heat, focus, and intensity.',
    kapha: 'Steadiness, softness, and endurance.',
  },
  es: {
    vata: 'Ligereza, cambio y movimiento rápido.',
    pitta: 'Calor, enfoque e intensidad.',
    kapha: 'Estabilidad, suavidad y resistencia.',
  },
  de: {
    vata: 'Leichtigkeit, Wandel und schnelle Bewegung.',
    pitta: 'Hitze, Fokus und Intensität.',
    kapha: 'Beständigkeit, Weichheit und Ausdauer.',
  },
}

function elevated(lang: Lang, doshas: Dosha[]): string {
  const names = joinNames(doshas.map(doshaName), lang)
  const one = doshas.length === 1
  if (lang === 'es') {
    return one
      ? `${names} está más alto ahora que en tu base.`
      : `${names} están más altos ahora que en tu base.`
  }
  if (lang === 'de') {
    return one
      ? `${names} ist jetzt höher als in deiner Basis.`
      : `${names} sind jetzt höher als in deiner Basis.`
  }
  return one
    ? `${names} is higher now than in your baseline.`
    : `${names} are higher now than in your baseline.`
}

export function quizCopy(lang: Lang): QuizCopy {
  if (lang === 'es') {
    return {
      partName: { prakriti: 'Prakriti', vikriti: 'Vikriti' },
      questionOf: (current, total) => `Pregunta ${current} de ${total}`,
      helper: 'Elige la opción que más se acerque.',
      back: 'Atrás',
      resultsEyebrow: 'Tus resultados',
      resultsTitle: 'Tu perfil ayurvédico',
      resultsLead: 'Esto compara tu constitución de base con tu estado actual. Para una reflexión personal, no es un diagnóstico.',
      prakritiCard: 'Tu Prakriti',
      vikritiCard: 'Tu Vikriti actual',
      doshaLine: doshaLine.es,
      whatChanged: 'Qué cambió',
      balanced: 'Tu estado actual está cerca de tu base.',
      elevated: (doshas) => elevated('es', doshas),
      cta: 'Explorar una lectura del iris',
      retakePrakriti: 'Repetir Prakriti',
      retakeVikriti: 'Repetir Vikriti',
      viewResults: 'Ver resultados',
      clearData: 'Borrar los datos guardados',
      historyTitle: 'Resultados anteriores de Vikriti',
      colDate: 'Fecha',
      colResult: 'Resultado',
      footnote: 'Los resultados se quedan solo en este navegador.',
    }
  }
  if (lang === 'de') {
    return {
      partName: { prakriti: 'Prakriti', vikriti: 'Vikriti' },
      questionOf: (current, total) => `Frage ${current} von ${total}`,
      helper: 'Wähle die Option, die am nächsten liegt.',
      back: 'Zurück',
      resultsEyebrow: 'Deine Ergebnisse',
      resultsTitle: 'Dein ayurvedisches Profil',
      resultsLead: 'Dies vergleicht deine Grundkonstitution mit deinem jetzigen Zustand. Zur persönlichen Einsicht, keine Diagnose.',
      prakritiCard: 'Dein Prakriti',
      vikritiCard: 'Dein aktuelles Vikriti',
      doshaLine: doshaLine.de,
      whatChanged: 'Was sich geändert hat',
      balanced: 'Dein jetziger Zustand liegt nah an deiner Basis.',
      elevated: (doshas) => elevated('de', doshas),
      cta: 'Eine Iris-Lesung ansehen',
      retakePrakriti: 'Prakriti wiederholen',
      retakeVikriti: 'Vikriti wiederholen',
      viewResults: 'Ergebnisse ansehen',
      clearData: 'Gespeicherte Quizdaten löschen',
      historyTitle: 'Frühere Vikriti-Ergebnisse',
      colDate: 'Datum',
      colResult: 'Ergebnis',
      footnote: 'Die Ergebnisse bleiben nur in diesem Browser.',
    }
  }
  return {
    partName: { prakriti: 'Prakriti', vikriti: 'Vikriti' },
    questionOf: (current, total) => `Question ${current} of ${total}`,
    helper: 'Select the option that feels closest.',
    back: 'Back',
    resultsEyebrow: 'Your results',
    resultsTitle: 'Your Ayurvedic Profile',
    resultsLead: 'This compares your baseline constitution with your current state. For personal insight, not a diagnosis.',
    prakritiCard: 'Your Prakriti',
    vikritiCard: 'Your Current Vikriti',
    doshaLine: doshaLine.en,
    whatChanged: 'What changed',
    balanced: 'Your current state is close to your baseline.',
    elevated: (doshas) => elevated('en', doshas),
    cta: 'Explore an iris reading',
    retakePrakriti: 'Retake Prakriti',
    retakeVikriti: 'Retake Vikriti',
    viewResults: 'View results',
    clearData: 'Clear saved quiz data',
    historyTitle: 'Previous Vikriti results',
    colDate: 'Date',
    colResult: 'Result',
    footnote: 'Results stay in this browser only.',
  }
}

export const PART_FRAME: Record<'prakriti' | 'vikriti', Record<Lang, string>> = {
  prakriti: {
    en: 'Answer as you have been since birth, for most of your life.',
    es: 'Responde como has sido desde el nacimiento, la mayor parte de tu vida.',
    de: 'Antworte so, wie du seit der Geburt gewesen bist, die meiste Zeit deines Lebens.',
  },
  vikriti: {
    en: 'Answer as your current state, in these recent weeks and months.',
    es: 'Responde según tu estado actual, en estas últimas semanas y meses.',
    de: 'Antworte nach deinem jetzigen Zustand, in diesen letzten Wochen und Monaten.',
  },
}
