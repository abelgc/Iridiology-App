import { createAdminClient } from '@/lib/supabase/server'
import { AnthropicProvider } from './anthropic-provider'
import { OpenAIProvider } from './openai-provider'
import type { AIProvider } from './types'
import type { PaymentTier } from '@/types/client-analysis'

const HAIKU_MODEL_ID = 'claude-haiku-4-5-20251001'
const SONNET_MODEL_ID = 'claude-sonnet-4-6'

export function getModelForTier(tier: PaymentTier): string {
  return tier === 'premium_19_90' ? SONNET_MODEL_ID : HAIKU_MODEL_ID
}

async function getSettings(): Promise<Record<string, string>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['active_provider', 'anthropic_api_key', 'openai_api_key', 'anthropic_model', 'openai_model'])
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))
}

export async function getAIProvider(): Promise<AIProvider> {
  const map = await getSettings()
  const activeProvider = map['active_provider'] ?? 'anthropic'

  if (activeProvider === 'openai') {
    const key = map['openai_api_key'] || process.env.OPENAI_API_KEY || ''
    const model = map['openai_model'] || process.env.OPENAI_MODEL || 'gpt-4o'
    return new OpenAIProvider(key, model)
  }

  const key = map['anthropic_api_key'] || process.env.ANTHROPIC_API_KEY || ''
  const model = map['anthropic_model'] || 'claude-sonnet-4-6'
  return new AnthropicProvider(key, model)
}

export async function getBothProviders(): Promise<{
  anthropic: AnthropicProvider
  openai: OpenAIProvider
} | null> {
  const map = await getSettings()

  if (map['active_provider'] !== 'both') return null

  const anthropicKey = map['anthropic_api_key'] || process.env.ANTHROPIC_API_KEY || ''
  const openaiKey = map['openai_api_key'] || process.env.OPENAI_API_KEY || ''

  if (!anthropicKey || !openaiKey) return null

  return {
    anthropic: new AnthropicProvider(anthropicKey, map['anthropic_model'] || 'claude-sonnet-4-6'),
    openai: new OpenAIProvider(openaiKey, map['openai_model'] || 'gpt-4o'),
  }
}
