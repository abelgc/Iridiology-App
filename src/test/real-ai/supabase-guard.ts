import type { SupabaseClient } from '@supabase/supabase-js'

// The pipeline reads API keys and provider settings from the `settings` table, exactly as in
// production, and writes observability rows (report_metrics). The real-AI suite lets the
// read-only `settings` lookup reach the configured Supabase project and swallows every other
// table access, so a test run never writes into a live database.

export const swallowedTableAccess: string[] = []

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function sink(table: string): unknown {
  swallowedTableAccess.push(table)
  const result = { data: null, error: null }
  const chain: unknown = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    },
    apply() {
      return chain
    },
  })
  return chain
}

function emptySettings(): unknown {
  const result = { data: [], error: null }
  const chain: unknown = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    },
    apply() {
      return chain
    },
  })
  return chain
}

export function guardAdminClient(createReal: () => SupabaseClient): SupabaseClient {
  const real = hasSupabaseEnv() && process.env.REAL_AI_SETTINGS_FROM_DB !== '0' ? createReal() : null
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (prop !== 'from') return real ? (real as unknown as Record<string | symbol, unknown>)[prop] : undefined
      return (table: string) => {
        if (table !== 'settings') return sink(table)
        if (!real) return emptySettings()
        return { select: (...args: Parameters<ReturnType<SupabaseClient['from']>['select']>) => real.from('settings').select(...args) }
      }
    },
  })
}
