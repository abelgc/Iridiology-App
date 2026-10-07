import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Lang, Recording, Role } from './types'

// Recordings live in src/test/ai-replay/recordings/:
//   <set>/set.json            what the set is, which commit's prompts produced it, optional `inherits`
//   <set>/<lang>/<role>.json  one real reply per call role and language
//   failures/<name>.json      real replies that broke production or the real-AI suite
// A set that only re-records some roles (e.g. stage 1 with structured output) inherits the rest.

export const RECORDINGS_DIR = path.join(__dirname, 'recordings')

/** The set whose prompts match this branch. Change it in the same commit that changes the prompts. */
export const DEFAULT_SET = 'stage1-structured-2026-10-07'

export interface SetManifest {
  name: string
  description: string
  inherits?: string
  commit?: string
}

const cache = new Map<string, unknown>()

function readJson<T>(file: string): T {
  if (!cache.has(file)) cache.set(file, JSON.parse(readFileSync(file, 'utf8')))
  return structuredClone(cache.get(file)) as T
}

export function setManifest(set: string): SetManifest {
  const file = path.join(RECORDINGS_DIR, set, 'set.json')
  if (!existsSync(file)) throw new Error(`[ai-replay] unknown recording set "${set}" (no ${file})`)
  return readJson<SetManifest>(file)
}

export function findRecording(set: string, lang: Lang, role: Role): { recording: Recording; file: string } | null {
  for (let current: string | undefined = set; current; current = setManifest(current).inherits) {
    const file = path.join(RECORDINGS_DIR, current, lang, `${role}.json`)
    if (existsSync(file)) return { recording: readJson<Recording>(file), file: path.relative(process.cwd(), file) }
  }
  return null
}

export function recording(set: string, lang: Lang, role: Role): Recording {
  const found = findRecording(set, lang, role)
  if (!found) throw new Error(`[ai-replay] no recording for ${role}/${lang} in set "${set}"`)
  return found.recording
}

export function failureRecording(name: string): Recording {
  const file = path.join(RECORDINGS_DIR, 'failures', `${name}.json`)
  if (!existsSync(file)) throw new Error(`[ai-replay] unknown failure recording "${name}" (no ${file})`)
  return readJson<Recording>(file)
}

export function rolesInSet(set: string, lang: Lang): Role[] {
  const roles = new Set<Role>()
  for (let current: string | undefined = set; current; current = setManifest(current).inherits) {
    const dir = path.join(RECORDINGS_DIR, current, lang)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) if (f.endsWith('.json')) roles.add(f.slice(0, -5) as Role)
  }
  return [...roles]
}
