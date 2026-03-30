import { createAdminClient } from '@/lib/supabase/server'
import { AnthropicProvider } from './anthropic-provider'
import { OpenAIProvider } from './openai-provider'
import type { AIProvider } from './types'

export async function getAIProvider(): Promise<AIProvider> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['active_provider', 'anthropic_api_key', 'openai_api_key', 'anthropic_model', 'openai_model'])

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))

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
