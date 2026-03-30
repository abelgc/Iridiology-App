'use client'

import { useState } from 'react'

interface SettingRow {
  key: string
  value: string | null
  hasValue: boolean
}

export function ProviderForm({ initialSettings }: { initialSettings: SettingRow[] }) {
  const get = (key: string) => initialSettings.find((s) => s.key === key)

  const [activeProvider, setActiveProvider] = useState(
    get('active_provider')?.value ?? 'anthropic'
  )
  const [anthropicKey, setAnthropicKey] = useState(
    get('anthropic_api_key')?.value ?? ''
  )
  const [openaiKey, setOpenaiKey] = useState(
    get('openai_api_key')?.value ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active_provider: activeProvider,
        anthropic_api_key: anthropicKey,
        openai_api_key: openaiKey,
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
    <form onSubmit={handleSubmit} className="space-y-8 max-w-lg">
      {/* Active provider */}
      <div className="space-y-3">
        <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>
          Active AI Provider
        </label>
        <div className="space-y-2">
          {(['anthropic', 'openai'] as const).map((p) => (
            <label key={p} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value={p}
                checked={activeProvider === p}
                onChange={() => setActiveProvider(p)}
                className="accent-teal-700"
              />
              <span className="text-sm font-medium capitalize">
                {p === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (GPT-4o)'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Anthropic key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>
          Anthropic API Key
        </label>
        <input
          type="password"
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-api03-..."
          className="w-full px-3 py-2 border rounded-md text-sm font-mono"
          style={{ borderColor: 'oklch(0.8 0.04 175)' }}
          autoComplete="off"
        />
        <p className="text-xs text-gray-400">Get yours at console.anthropic.com</p>
      </div>

      {/* OpenAI key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>
          OpenAI API Key
        </label>
        <input
          type="password"
          value={openaiKey}
          onChange={(e) => setOpenaiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full px-3 py-2 border rounded-md text-sm font-mono"
          style={{ borderColor: 'oklch(0.8 0.04 175)' }}
          autoComplete="off"
        />
        <p className="text-xs text-gray-400">Get yours at platform.openai.com</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: 'oklch(0.45 0.12 175)' }}
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
      </button>
    </form>
  )
}
