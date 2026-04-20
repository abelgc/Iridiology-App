import { describe, it, expect } from 'vitest'
import {
  validateImage,
  IMAGE_MAX_BYTES,
  ALLOWED_MIME_TYPES,
  MIN_DIMENSION,
} from '@/lib/client/image-validation'

function makeBlob(bytes: number, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

describe('image-validation', () => {
  it('exposes the documented constants', () => {
    expect(IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(ALLOWED_MIME_TYPES).toEqual(['image/jpeg', 'image/png'])
    expect(MIN_DIMENSION).toBe(800)
  })

  it('rejects images larger than 10 MB', async () => {
    const blob = makeBlob(IMAGE_MAX_BYTES + 1, 'image/jpeg')
    const result = await validateImage(blob, { width: 1024, height: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_large')
  })

  it('rejects unsupported mime types', async () => {
    const blob = makeBlob(1024, 'image/gif')
    const result = await validateImage(blob, { width: 1024, height: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_format')
  })

  it('rejects images smaller than 800x800', async () => {
    const blob = makeBlob(1024, 'image/jpeg')
    const result = await validateImage(blob, { width: 600, height: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_small')
  })

  it('accepts a valid image', async () => {
    const blob = makeBlob(1024, 'image/jpeg')
    const result = await validateImage(blob, { width: 1024, height: 1024 })
    expect(result.ok).toBe(true)
  })
})
