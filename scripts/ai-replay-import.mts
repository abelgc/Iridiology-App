// Converts real-AI suite artifacts (test-results/real-ai/*.json, written by
// `npm run test:real-ai`) into replay recordings under src/test/ai-replay/recordings/.
// Free: it only reads files that a paid run already produced. Runs on plain Node 24
// (type stripping), no build step:
//
//   node scripts/ai-replay-import.mts set <set> <artifact.json> [--roles planner,writer-A] [--commit <sha>] [--note <text>]
//   node scripts/ai-replay-import.mts failure <name> <artifact.json> <role> [--nth 1] [--commit <sha>] [--note <text>]
//   node scripts/ai-replay-import.mts manifest <set> --description <text> [--inherits <set>] [--commit <sha>]
//
// Every text goes through anonymize() (emails, keys, request ids, UUIDs, phone numbers, IBANs,
// and the fictional intake names of the real-AI suite). Read the diff before committing.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { CapturedCall, CaptureMeta } from '../src/test/ai-replay/convert'
import type { Recording } from '../src/test/ai-replay/types'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const recordingsDir = path.join(root, 'src/test/ai-replay/recordings')
const convertModule = pathToFileURL(path.join(root, 'src/test/ai-replay/convert.ts')).href
const { toRecording, REAL_AI_SUITE_NAMES } = (await import(convertModule)) as typeof import('../src/test/ai-replay/convert')

const [command, ...rest] = process.argv.slice(2)
const flags = new Map<string, string>()
const positional: string[] = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags.set(rest[i].slice(2), rest[++i] ?? '')
  else positional.push(rest[i])
}

function readArtifact(file: string): { lang: string; calls: CapturedCall[]; capturedAt: string } {
  const artifact = JSON.parse(readFileSync(file, 'utf8')) as { lang: string; calls: Array<CapturedCall & { lang?: string }> }
  const stamp = path.basename(file).match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/)
  const capturedAt = stamp ? `${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}Z` : new Date().toISOString()
  return { lang: artifact.lang, calls: artifact.calls.map((c) => ({ ...c, lang: c.lang ?? artifact.lang })), capturedAt }
}

function meta(file: string, capturedAt: string): CaptureMeta {
  return {
    run: `test-results/real-ai/${path.basename(file)}`,
    capturedAt,
    commit: flags.get('commit'),
    note: flags.get('note'),
    names: REAL_AI_SUITE_NAMES,
  }
}

function write(file: string, recording: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(recording, null, 2) + '\n')
  console.log('wrote', path.relative(root, file))
}

if (command === 'set') {
  const [set, file] = positional
  const { lang, calls, capturedAt } = readArtifact(file)
  const only = flags.get('roles')?.split(',')
  const seen = new Set<string>()
  for (const call of calls) {
    if (only && !only.includes(call.label)) continue
    // The first clean reply per role. Retries and cut-off replies belong in failures/.
    if (seen.has(call.label) || call.stopReason === 'max_tokens' || call.stopReason === 'length') continue
    const recording: Recording | null = toRecording(call, meta(file, capturedAt))
    if (!recording) continue
    seen.add(call.label)
    write(path.join(recordingsDir, set, lang, `${call.label}.json`), recording)
  }
} else if (command === 'failure') {
  const [name, file, role] = positional
  const nth = Number(flags.get('nth') ?? '1')
  const { calls, capturedAt } = readArtifact(file)
  const call = calls.filter((c) => c.label === role)[nth - 1]
  if (!call) throw new Error(`no call #${nth} with role ${role} in ${file}`)
  const recording = toRecording(call, meta(file, capturedAt))
  if (!recording) throw new Error(`call #${nth} ${role} in ${file} cannot be replayed (error or no usage)`)
  write(path.join(recordingsDir, 'failures', `${name}.json`), recording)
} else if (command === 'manifest') {
  const [set] = positional
  write(path.join(recordingsDir, set, 'set.json'), {
    name: set,
    description: flags.get('description') ?? '',
    ...(flags.get('inherits') ? { inherits: flags.get('inherits') } : {}),
    ...(flags.get('commit') ? { commit: flags.get('commit') } : {}),
  })
} else {
  console.error('usage: node scripts/ai-replay-import.mts set|failure|manifest ... (see the header of this file)')
  process.exit(1)
}
