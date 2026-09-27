import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// These routes use the service-role client, which bypasses RLS. The proxy already gates
// /api/**, but a matcher change or a new route must not be enough to expose patient data.
export async function requirePractitioner(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return null
}
