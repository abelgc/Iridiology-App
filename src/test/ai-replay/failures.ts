import { failureRecording } from './recordings'
import type { Recording, Reply } from './types'

// Failure shapes, from real captures where one exists. Each entry says where it came from.

/**
 * REAL, claude-sonnet-5, stop_reason end_turn: a 1-section JSON object, then "Wait, let me
 * produce the full complete JSON with all 14 keys properly." (en) or "Entschuldigung, ich muss
 * den Bericht vollständig..." (de), then a second, complete JSON. 2026-10-07 real-AI runs.
 */
export function claudeLegRestart(lang: 'en' | 'de'): Recording {
  return failureRecording(`claude-leg-restart-${lang}`)
}

/**
 * REAL Planner replies from master before 4c3bd5c: cut off at max_tokens 1200, then again at
 * 2400 on the doubling retry. The text is the model's real (truncated) output.
 */
export function plannerCutOffAtOldBudget(lang: 'es' | 'en' | 'de', attempt: 1200 | 2400): Recording {
  return failureRecording(`planner-cut-off-${attempt}-${lang}`)
}

/**
 * REAL Writer A replies, es, 2026-10-07 16:22 (fix/stage1-json-integrity real-AI run): first
 * reply invalid JSON ("Expected double-quoted property name"), the retry invalid again. Stage 2
 * threw "Expected ',' or '}' after property value in JSON at position 1389".
 */
export function writerAInvalidJson(attempt: 1 | 2): Recording {
  return failureRecording(`writer-A-invalid-json-es-${attempt}`)
}

/**
 * The 2026-10-05 production shape (synthesis and Claude-only fallback): valid JSON for the
 * first sections, closed, then the remaining sections as markdown headings
 * ("**Español: Sistema Digestivo e Intestinal**"). The production text was client data and is
 * not in the repo, so this is DERIVED from a real full-size recording: its first `keepJson`
 * sections stay JSON, the rest of its own real text is rewritten as markdown.
 */
export function jsonThenMarkdown(source: Recording, keepJson = 7): Recording {
  const raw = source.response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const report = JSON.parse(raw) as Record<string, string>
  const keys = Object.keys(report)
  const head = Object.fromEntries(keys.slice(0, keepJson).map((k) => [k, report[k]]))
  const heading: Record<string, string> = { es: 'Español', en: 'English', de: 'Deutsch' }
  const tail = keys
    .slice(keepJson)
    .map((k) => `**${heading[source.lang]}: ${k.replace(/^section_\d+_/, '').replace(/_/g, ' ')}**\n\n${report[k]}`)
    .join('\n\n')
  return {
    ...source,
    response: { ...source.response, text: `${JSON.stringify(head, null, 2)}\n\n${tail}\n` },
    source: { ...source.source, note: `derived: JSON for ${keepJson} sections then markdown, from ${source.source.run}` },
  }
}

/**
 * Anthropic 400 when the account runs out of credit. The message is the one production logged
 * and the 2026-10-07 real-AI run on fix/stage1-json-integrity hit; the envelope is Anthropic's
 * documented error shape.
 */
export function creditBalanceTooLow(): Reply {
  return {
    kind: 'http-error',
    status: 400,
    body: {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
      },
      request_id: 'req_REDACTED',
    },
    source: 'anthropic credit balance 400 (production + 2026-10-07 real-AI run)',
  }
}

/** Anthropic 529 overloaded_error, documented shape. The SDK retries it when maxRetries > 0. */
export function overloaded(): Reply {
  return {
    kind: 'http-error',
    status: 529,
    body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' }, request_id: 'req_REDACTED' },
    source: 'anthropic 529 overloaded (documented shape)',
  }
}

/** OpenAI 500, documented shape. */
export function openaiServerError(): Reply {
  return {
    kind: 'http-error',
    status: 500,
    body: { error: { message: 'The server had an error while processing your request.', type: 'server_error', param: null, code: null } },
    source: 'openai 500 server_error (documented shape)',
  }
}

/** The provider never answers; only the SDK timeout or the route's withTimeout ends the call. */
export function hang(): Reply {
  return { kind: 'hang', source: 'provider never answers (stalled connection)' }
}
