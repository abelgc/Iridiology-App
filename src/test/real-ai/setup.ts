import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { installModelCallRecorder } from './instrument'

// Same hand-rolled loader as integration-setup.ts: Vitest does not populate process.env from
// dotenv files, and @next/env skips .env.local when NODE_ENV=test. Values already present in
// the environment win, so CI secrets override any file.
for (const file of ['.env.local', '.env']) {
  const envPath = path.resolve(process.cwd(), file)
  if (!existsSync(envPath)) continue
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

installModelCallRecorder()
