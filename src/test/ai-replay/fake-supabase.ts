import { randomUUID } from 'node:crypto'

// In-memory stand-in for the Supabase admin client, for offline end-to-end runs of the client
// routes. It implements the PostgREST query shapes those routes use, with the semantics their
// compare-and-swaps depend on: filters really filter, `.single()` on zero rows returns
// { data: null, error }, updates only touch matching rows, embedded `alias:fk ( cols )`
// selects resolve the foreign row, and every result is a copy (as if it crossed the wire).

type Row = Record<string, unknown>

export interface FakeDb {
  tables: Record<string, Row[]>
  /** Every write, in order, for assertions on what reached the database. */
  writes: Array<{ table: string; op: 'insert' | 'update'; payload: Row; matched: number }>
  from(table: string): FakeQuery
}

const NOT_FOUND = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: '', hint: '' }

function project(db: FakeDb, row: Row, columns: string): Row {
  const embedded = [...columns.matchAll(/(\w+)\s*:\s*(\w+)\s*\(([^)]*)\)/g)]
  const plain = columns
    .replace(/(\w+)\s*:\s*(\w+)\s*\(([^)]*)\)/g, '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  const out: Row = plain.includes('*') ? structuredClone(row) : {}
  for (const col of plain) if (col !== '*') out[col] = structuredClone(row[col] ?? null)
  for (const [, alias, fk, cols] of embedded) {
    const target = (db.tables[alias] ?? []).find((r) => r.id === row[fk])
    out[alias] = target ? project(db, target, cols) : null
  }
  return out
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: 'select' | 'insert' | 'update' = 'select'
  private payload: Row | Row[] | null = null
  private columns: string | null = null
  private filters: Array<(row: Row) => boolean> = []
  private wantSingle = false
  private maxRows: number | null = null

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(columns = '*') {
    this.columns = columns
    return this
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert'
    this.payload = rows
    return this
  }
  update(values: Row) {
    this.op = 'update'
    this.payload = values
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value)
    return this
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.maxRows = n
    return this
  }
  single() {
    this.wantSingle = true
    return this
  }
  maybeSingle() {
    this.wantSingle = true
    return this
  }

  private rows(): Row[] {
    return (this.db.tables[this.table] ??= [])
  }

  private execute(): { data: unknown; error: unknown } {
    let affected: Row[]
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!]
      affected = list.map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...structuredClone(r) }))
      this.rows().push(...affected)
      for (const r of list) this.db.writes.push({ table: this.table, op: 'insert', payload: structuredClone(r), matched: 1 })
    } else if (this.op === 'update') {
      affected = this.rows().filter((r) => this.filters.every((f) => f(r)))
      for (const r of affected) Object.assign(r, structuredClone(this.payload))
      this.db.writes.push({ table: this.table, op: 'update', payload: structuredClone(this.payload as Row), matched: affected.length })
    } else {
      affected = this.rows().filter((r) => this.filters.every((f) => f(r)))
    }
    if (this.maxRows !== null) affected = affected.slice(0, this.maxRows)
    if (this.op !== 'select' && this.columns === null) return { data: null, error: null }
    const shaped = affected.map((r) => project(this.db, r, this.columns ?? '*'))
    if (!this.wantSingle) return { data: shaped, error: null }
    return shaped.length === 1 ? { data: shaped[0], error: null } : { data: null, error: NOT_FOUND }
  }

  then<A = { data: unknown; error: unknown }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected)
  }
}

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables: structuredClone(tables),
    writes: [],
    from: (table: string) => new FakeQuery(db, table),
  }
  return db
}
