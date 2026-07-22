import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const code = body.code?.trim()
  const secret = process.env.OWNER_TEST_DISCOUNT_CODE

  if (!code || !secret) {
    return NextResponse.json({ valid: false })
  }

  const valid = code.toUpperCase() === secret.toUpperCase()
  return NextResponse.json({ valid })
}
