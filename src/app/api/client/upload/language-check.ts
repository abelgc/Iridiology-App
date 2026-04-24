import { detect } from 'tinyld'

export function detectsCorrectLanguage(text: string, expectedLang: string): boolean {
  if (!text || text.length < 50) return true // too short to detect reliably
  const detected = detect(text)
  return detected === expectedLang
}
