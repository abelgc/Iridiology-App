// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Real, paid Anthropic calls. Opt-in only:
//   RUN_LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=... npx vitest run src/lib/client/__tests__/writing-pipeline.live.test.ts
const live = process.env.RUN_LIVE_ANTHROPIC === '1' && Boolean(process.env.ANTHROPIC_API_KEY)

const truncatedCalls: string[] = []

vi.mock('@anthropic-ai/sdk', async () => {
  const actual = await vi.importActual<typeof import('@anthropic-ai/sdk')>('@anthropic-ai/sdk')
  const Real = actual.default
  class Recording extends Real {
    constructor(...args: ConstructorParameters<typeof Real>) {
      super(...args)
      type Create = (
        params: { system?: unknown; max_tokens: number },
        options?: unknown,
      ) => Promise<{ stop_reason: string | null }>
      const messages = this.messages as unknown as { create: Create }
      const create = messages.create.bind(messages)
      messages.create = async (params, options) => {
        const response = await create(params, options)
        if (response.stop_reason === 'max_tokens') {
          const role = String(params.system).match(/You are (the Planner|Writer [ABC])/)?.[1] ?? 'unknown'
          truncatedCalls.push(`${role} at max_tokens ${params.max_tokens}`)
        }
        return response
      }
    }
  }
  return { ...actual, default: Recording }
})

vi.mock('@/lib/ai/get-provider', () => ({
  getAnthropicApiKey: async () => process.env.ANTHROPIC_API_KEY ?? '',
}))

import { rewriteReportForClient } from '../writing-pipeline'
import { fullSizeReportEs } from './fixtures/full-size-report-es'

describe.runIf(live)('rewriteReportForClient against the real model', () => {
  it(
    'REGRESSION (2026-10-07 production incident, response_too_long): a full-size premium report goes through the Planner and all three Writers without a single truncated response',
    async () => {
      const result = await rewriteReportForClient(fullSizeReportEs, 'es', 'Lucía')

      for (let n = 1; n <= 13; n++) {
        const key = Object.keys(fullSizeReportEs).find((k) => k.startsWith(`section_${n}_`))!
        expect(result[key], key).toMatch(/\S/)
      }
      expect(truncatedCalls).toEqual([])
    },
    240_000,
  )
})
