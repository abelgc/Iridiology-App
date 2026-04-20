import { randomUUID } from 'node:crypto'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function generateReportToken(): string {
  return randomUUID()
}

export function isValidReportToken(value: string): boolean {
  return typeof value === 'string' && UUID_V4_REGEX.test(value)
}
