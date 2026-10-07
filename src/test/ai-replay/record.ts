import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REAL_AI_SUITE_NAMES, toRecording, type CapturedCall } from './convert'
import { RECORDINGS_DIR } from './recordings'

// Record mode for the real-AI suite. Turned on only by AI_REPLAY_RECORD=<set name>, together
// with dedicated keys (see src/test/real-ai/setup.ts); never on by default. After the run,
// the first clean reply per role and language goes to recordings/<set>/<lang>/<role>.json,
// anonymized; cut-off and repeated replies go to test-results/real-ai/recordings-rejected/
// for review (copy the interesting ones to recordings/failures/ by hand).

export function writeRecordedSet(set: string, calls: CapturedCall[], dir: string = RECORDINGS_DIR): string[] {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(set)) throw new Error(`AI_REPLAY_RECORD="${set}" is not a valid set name (lowercase, digits, dashes)`)
  const capturedAt = new Date().toISOString()
  let commit = 'unknown'
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    // not a git checkout
  }
  const run = `record ${set} ${capturedAt}`
  const written: string[] = []
  const seen = new Set<string>()
  const rejectedDir = path.resolve(process.cwd(), 'test-results/real-ai/recordings-rejected', set)
  calls.forEach((call, i) => {
    const recording = toRecording(call, { run, capturedAt, commit, names: REAL_AI_SUITE_NAMES })
    if (!recording) return
    const key = `${recording.lang}/${recording.role}`
    if (seen.has(key) || recording.response.stopReason === 'max_tokens') {
      mkdirSync(rejectedDir, { recursive: true })
      writeFileSync(path.join(rejectedDir, `${recording.lang}-${recording.role}-${i}.json`), JSON.stringify(recording, null, 2) + '\n')
      return
    }
    seen.add(key)
    const file = path.join(dir, set, recording.lang, `${recording.role}.json`)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(recording, null, 2) + '\n')
    written.push(file)
  })
  const manifest = path.join(dir, set, 'set.json')
  mkdirSync(path.dirname(manifest), { recursive: true })
  writeFileSync(
    manifest,
    JSON.stringify(
      { name: set, description: process.env.AI_REPLAY_DESCRIPTION ?? `Recorded by the real-AI suite on ${capturedAt}.`, commit },
      null,
      2,
    ) + '\n',
  )
  return written
}
