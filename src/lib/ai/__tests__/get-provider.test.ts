import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const anthropicCtor = vi.fn()
const openaiCtor = vi.fn()

vi.mock('../anthropic-provider', () => ({
  AnthropicProvider: class {
    constructor(apiKey: string, model?: string) {
      anthropicCtor(apiKey, model)
    }
  },
}))

vi.mock('../openai-provider', () => ({
  OpenAIProvider: class {
    constructor(apiKey: string, model?: string) {
      openaiCtor(apiKey, model)
    }
  },
}))

let settingsRows: Array<{ key: string; value: string }> = []
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: settingsRows }),
      }),
    }),
  }),
}))

import { getAIProvider, getBothProviders, getAnthropicApiKey, getClientProviders, TIER_MODELS } from '../get-provider'

describe('get-provider settings/env fallback chain', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    settingsRows = []
    anthropicCtor.mockClear()
    openaiCtor.mockClear()
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('getAIProvider', () => {
    it('defaults to the anthropic branch when no active_provider row exists', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-anthropic-key'
      await getAIProvider()
      expect(anthropicCtor).toHaveBeenCalledWith('env-anthropic-key', 'claude-sonnet-5')
      expect(openaiCtor).not.toHaveBeenCalled()
    })

    it('prefers the settings-table key over the env var when both are present', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-key'
      settingsRows = [{ key: 'anthropic_api_key', value: 'settings-key' }]
      await getAIProvider()
      expect(anthropicCtor).toHaveBeenCalledWith('settings-key', 'claude-sonnet-5')
    })

    it('switches to the openai branch when active_provider is "openai", falling back to env OPENAI_MODEL', async () => {
      process.env.OPENAI_API_KEY = 'env-openai-key'
      process.env.OPENAI_MODEL = 'gpt-5.6-luna'
      settingsRows = [{ key: 'active_provider', value: 'openai' }]
      await getAIProvider()
      expect(openaiCtor).toHaveBeenCalledWith('env-openai-key', 'gpt-5.6-luna')
      expect(anthropicCtor).not.toHaveBeenCalled()
    })

    it("defaults the openai model to 'gpt-5.6-sol' when neither settings nor env provide one", async () => {
      process.env.OPENAI_API_KEY = 'env-openai-key'
      settingsRows = [{ key: 'active_provider', value: 'openai' }]
      await getAIProvider()
      expect(openaiCtor).toHaveBeenCalledWith('env-openai-key', 'gpt-5.6-sol')
    })
  })

  describe('getBothProviders', () => {
    it('returns null when active_provider is not exactly "both"', async () => {
      process.env.ANTHROPIC_API_KEY = 'a'
      process.env.OPENAI_API_KEY = 'b'
      settingsRows = [{ key: 'active_provider', value: 'anthropic' }]
      expect(await getBothProviders()).toBeNull()
    })

    it('returns null when active_provider is "both" but one key resolves empty', async () => {
      process.env.ANTHROPIC_API_KEY = 'a'
      // OPENAI_API_KEY deliberately absent from both settings and env.
      settingsRows = [{ key: 'active_provider', value: 'both' }]
      expect(await getBothProviders()).toBeNull()
      expect(anthropicCtor).not.toHaveBeenCalled()
      expect(openaiCtor).not.toHaveBeenCalled()
    })

    it('constructs both providers when active_provider is "both" and both keys resolve via env fallback', async () => {
      process.env.ANTHROPIC_API_KEY = 'a'
      process.env.OPENAI_API_KEY = 'b'
      settingsRows = [{ key: 'active_provider', value: 'both' }]
      const result = await getBothProviders()
      expect(result).not.toBeNull()
      expect(anthropicCtor).toHaveBeenCalledWith('a', 'claude-sonnet-5')
      expect(openaiCtor).toHaveBeenCalledWith('b', 'gpt-5.6-sol')
    })
  })

  describe('getAnthropicApiKey', () => {
    it('prefers the settings-table value over the env var', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-key'
      settingsRows = [{ key: 'anthropic_api_key', value: 'settings-key' }]
      expect(await getAnthropicApiKey()).toBe('settings-key')
    })

    it('falls back to the env var when settings has no row', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-key'
      expect(await getAnthropicApiKey()).toBe('env-key')
    })

    it('returns an empty string when neither settings nor env provide a key', async () => {
      expect(await getAnthropicApiKey()).toBe('')
    })
  })

  describe('getClientProviders', () => {
    it('maps basic_1990 to the haiku/luna model pair from TIER_MODELS', async () => {
      process.env.ANTHROPIC_API_KEY = 'a'
      process.env.OPENAI_API_KEY = 'b'
      await getClientProviders('basic_1990')
      expect(anthropicCtor).toHaveBeenCalledWith('a', TIER_MODELS.basic_1990.anthropic)
      expect(openaiCtor).toHaveBeenCalledWith('b', TIER_MODELS.basic_1990.openai)
    })

    it('maps premium_2990 to the sonnet/sol model pair from TIER_MODELS', async () => {
      process.env.ANTHROPIC_API_KEY = 'a'
      process.env.OPENAI_API_KEY = 'b'
      await getClientProviders('premium_2990')
      expect(anthropicCtor).toHaveBeenCalledWith('a', TIER_MODELS.premium_2990.anthropic)
      expect(openaiCtor).toHaveBeenCalledWith('b', TIER_MODELS.premium_2990.openai)
    })
  })
})
