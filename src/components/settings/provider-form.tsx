'use client'

import { useState } from 'react'

interface SettingRow {
  key: string
  value: string | null
  hasValue: boolean
}

export function ProviderForm({ initialSettings }: { initialSettings: SettingRow[] }) {
  const get = (key: string) => initialSettings.find((s) => s.key === key)

  const initialProvider = get('active_provider')?.value ?? 'anthropic'
  const [anthropicEnabled, setAnthropicEnabled] = useState(
    initialProvider === 'anthropic' || initialProvider === 'both'
  )
  const [openaiEnabled, setOpenaiEnabled] = useState(
    initialProvider === 'openai' || initialProvider === 'both'
  )
  const [anthropicKey, setAnthropicKey] = useState(get('anthropic_api_key')?.value ?? '')
  const [anthropicModel, setAnthropicModel] = useState(get('anthropic_model')?.value || 'claude-sonnet-4-6')
  const [openaiKey, setOpenaiKey] = useState(get('openai_api_key')?.value ?? '')
  const [openaiModel, setOpenaiModel] = useState(get('openai_model')?.value || 'gpt-4o')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeProvider = anthropicEnabled && openaiEnabled ? 'both'
    : anthropicEnabled ? 'anthropic'
    : openaiEnabled ? 'openai'
    : null

  const dualMode = activeProvider === 'both'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProvider) {
      setError('Select at least one provider.')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active_provider: activeProvider,
        anthropic_api_key: anthropicKey,
        anthropic_model: anthropicModel,
        openai_api_key: openaiKey,
        openai_model: openaiModel,
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to save settings')
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-lg px-4 sm:px-0">

      {/* Provider selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>
          Active AI Providers
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={anthropicEnabled}
              onChange={(e) => setAnthropicEnabled(e.target.checked)}
              className="accent-teal-700 w-4 h-4"
            />
            <span className="text-sm font-medium">Anthropic — {anthropicModel}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={openaiEnabled}
              onChange={(e) => setOpenaiEnabled(e.target.checked)}
              className="accent-teal-700 w-4 h-4"
            />
            <span className="text-sm font-medium">OpenAI — {openaiModel}</span>
          </label>
        </div>

        {dualMode && (
          <div className="mt-3 px-3 py-2 rounded-md text-xs font-medium" style={{ backgroundColor: 'oklch(0.93 0.05 175)', color: 'oklch(0.35 0.1 175)' }}>
            Dual-model synthesis active — both models analyse in parallel, Claude produces the final report.
          </div>
        )}
        {!activeProvider && (
          <p className="text-xs text-red-500">Select at least one provider.</p>
        )}
      </div>

      {/* Anthropic */}
      <div className="space-y-3 p-4 rounded-lg border" style={{ borderColor: anthropicEnabled ? 'oklch(0.7 0.1 175)' : 'oklch(0.88 0.02 175)', opacity: anthropicEnabled ? 1 : 0.5 }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'oklch(0.5 0.06 175)' }}>Anthropic (Claude)</p>
        <div className="space-y-2">
          <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>API Key</label>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="w-full px-3 py-2 border rounded-md text-sm font-mono"
            style={{ borderColor: 'oklch(0.8 0.04 175)' }}
            autoComplete="off"
          />
          <p className="text-xs text-gray-400">console.anthropic.com</p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>Model</label>
          <input
            type="text"
            value={anthropicModel}
            onChange={(e) => setAnthropicModel(e.target.value)}
            placeholder="claude-sonnet-4-6"
            className="w-full px-3 py-2 border rounded-md text-sm font-mono"
            style={{ borderColor: 'oklch(0.8 0.04 175)' }}
          />
          <p className="text-xs text-gray-400">e.g. claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5</p>
        </div>
      </div>

      {/* OpenAI */}
      <div className="space-y-3 p-4 rounded-lg border" style={{ borderColor: openaiEnabled ? 'oklch(0.7 0.1 175)' : 'oklch(0.88 0.02 175)', opacity: openaiEnabled ? 1 : 0.5 }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'oklch(0.5 0.06 175)' }}>OpenAI</p>
        <div className="space-y-2">
          <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>API Key</label>
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="sk-proj-..."
            className="w-full px-3 py-2 border rounded-md text-sm font-mono"
            style={{ borderColor: 'oklch(0.8 0.04 175)' }}
            autoComplete="off"
          />
          <p className="text-xs text-gray-400">platform.openai.com</p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>Model</label>
          <input
            type="text"
            value={openaiModel}
            onChange={(e) => setOpenaiModel(e.target.value)}
            placeholder="gpt-4o"
            className="w-full px-3 py-2 border rounded-md text-sm font-mono"
            style={{ borderColor: 'oklch(0.8 0.04 175)' }}
          />
          <p className="text-xs text-gray-400">e.g. gpt-4o, gpt-4o-mini</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving || !activeProvider}
        className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: 'oklch(0.45 0.12 175)' }}
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
      </button>
    </form>
  )
}
