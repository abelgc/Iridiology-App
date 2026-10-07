import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { afterAll } from 'vitest'
import { installModelCallRecorder, recordedCalls } from './instrument'
import { writeRecordedSet } from '../ai-replay/record'

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

// ---- Spending guard: this suite pays for real model calls. ----
// Measured 2026-10-07: one language on premium_2990 is ~78k input / 22k output tokens on
// claude-sonnet-5 plus ~19k / 1.5k on gpt-5.6-sol, about 0.70 USD; es+en+de about 2 USD.
// basic_1990 is cheaper; the estimate uses the premium figure as an upper bound.
const USD_PER_LANGUAGE_RUN = 0.7
const langs = (process.env.REAL_AI_LANGS ?? 'es,en,de').split(',').map((s) => s.trim()).filter(Boolean)
const tiers = (process.env.REAL_AI_TIERS ?? 'premium_2990').split(',').map((s) => s.trim()).filter(Boolean)
const estimate = (langs.length * tiers.length * USD_PER_LANGUAGE_RUN).toFixed(2)
const dedicatedKeys = Boolean(process.env.REAL_AI_ANTHROPIC_API_KEY && process.env.REAL_AI_OPENAI_API_KEY)
const recordSet = process.env.AI_REPLAY_RECORD?.trim()

if (process.env.REAL_AI_CONFIRM_SPEND !== 'yes') {
  if (process.env.REAL_AI_ALLOW_SKIP === '1') {
    // Skip on purpose: hide every key so the suite takes its no-keys branch and spends nothing.
    process.env.REAL_AI_SETTINGS_FROM_DB = '0'
    process.env.ANTHROPIC_API_KEY = ''
    process.env.OPENAI_API_KEY = ''
  } else {
    throw new Error(
      `[real-ai] This suite makes REAL paid Anthropic + OpenAI calls: ${langs.length} language(s) x ${tiers.length} tier(s), ` +
        `estimated ${estimate} USD. Set REAL_AI_CONFIRM_SPEND=yes to run it. ` +
        `Free alternative: \`npm test\` replays real recorded replies (src/test/ai-replay).`,
    )
  }
}

if (dedicatedKeys) {
  // A separate, low-limit key pair: test runs never touch the production keys or credit.
  process.env.ANTHROPIC_API_KEY = process.env.REAL_AI_ANTHROPIC_API_KEY
  process.env.OPENAI_API_KEY = process.env.REAL_AI_OPENAI_API_KEY
  process.env.REAL_AI_SETTINGS_FROM_DB = '0'
}

if (recordSet && !dedicatedKeys) {
  throw new Error(
    '[real-ai] AI_REPLAY_RECORD needs REAL_AI_ANTHROPIC_API_KEY and REAL_AI_OPENAI_API_KEY (a dedicated, low-limit key pair). ' +
      'Recording never uses the production keys from the settings table.',
  )
}

if (process.env.REAL_AI_CONFIRM_SPEND === 'yes') {
  console.warn(
    `\n[real-ai] SPENDING about ${estimate} USD: ${langs.join(',')} x ${tiers.join(',')}. ` +
      (dedicatedKeys
        ? 'Using the dedicated REAL_AI_* keys.'
        : 'Using the keys from the settings table / ANTHROPIC_API_KEY (production credit). Prefer REAL_AI_ANTHROPIC_API_KEY + REAL_AI_OPENAI_API_KEY.') +
      (recordSet ? ` Recording replies into src/test/ai-replay/recordings/${recordSet}/.` : '') +
      '\n',
  )
}

installModelCallRecorder()

if (recordSet) {
  afterAll(() => {
    const written = writeRecordedSet(recordSet, recordedCalls())
    console.log(`[real-ai] recorded ${written.length} replies:\n  ${written.join('\n  ')}\nReview the diff for personal data before committing.`)
  })
}
