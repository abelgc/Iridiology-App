import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const ALLOWED_KEYS = ['active_provider', 'anthropic_api_key', 'openai_api_key', 'anthropic_model', 'openai_model'] as const

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ALLOWED_KEYS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mask key values — return only last 4 chars
  const masked = (data ?? []).map((row) => ({
    key: row.key,
    value: row.key.endsWith('_key') && row.value
      ? '••••••••' + row.value.slice(-4)
      : row.value,
    hasValue: Boolean(row.value),
  }))

  return NextResponse.json(masked)
}

export async function POST(request: Request) {
  const body = await request.json()
  const updates: Array<{ key: string; value: string }> = []

  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      // Don't overwrite with masked value (user left field unchanged)
      if (typeof body[key] === 'string' && !body[key].startsWith('••••')) {
        updates.push({ key, value: body[key] })
      }
    }
  }

  if (updates.length === 0) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('settings')
    .upsert(updates.map((u) => ({ ...u, updated_at: new Date().toISOString() })), {
      onConflict: 'key',
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
