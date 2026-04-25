import { createAdminClient } from '@/lib/supabase/server'
import { ProviderForm } from '@/components/settings/provider-form'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['active_provider', 'anthropic_api_key', 'openai_api_key', 'anthropic_model', 'openai_model'])

  const settings = (data ?? []).map((row) => ({
    key: row.key,
    value: row.key.endsWith('_key') && row.value
      ? '••••••••' + row.value.slice(-4)
      : row.value,
    hasValue: Boolean(row.value),
  }))

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2" style={{ color: 'oklch(0.3 0.06 175)' }}>
        AI Provider Settings
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        Choose which AI provider to use for iris analysis. Keys are stored securely in the database.
      </p>
      <ProviderForm initialSettings={settings} />
    </div>
  )
}
