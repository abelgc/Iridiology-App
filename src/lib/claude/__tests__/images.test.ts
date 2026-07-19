import { describe, it, expect } from 'vitest'
import { parseImageDataUrl } from '../images'

describe('parseImageDataUrl', () => {
  it('detects a PNG data URL and returns image/png with the raw base64 payload', () => {
    const result = parseImageDataUrl('data:image/png;base64,AAA')
    expect(result).toEqual({ data: 'AAA', mediaType: 'image/png' })
  })

  it('detects a JPEG data URL and returns image/jpeg with the raw base64 payload', () => {
    const result = parseImageDataUrl('data:image/jpeg;base64,BBB')
    expect(result).toEqual({ data: 'BBB', mediaType: 'image/jpeg' })
  })

  it('detects a WEBP data URL and returns image/webp with the raw base64 payload', () => {
    const result = parseImageDataUrl('data:image/webp;base64,CCC')
    expect(result).toEqual({ data: 'CCC', mediaType: 'image/webp' })
  })

  it('falls back to image/jpeg for a bare base64 payload with no data URL prefix', () => {
    // Matches the practitioner upload path, which strips the prefix client-side
    // and always encodes JPEG before sending.
    const result = parseImageDataUrl('DDD')
    expect(result).toEqual({ data: 'DDD', mediaType: 'image/jpeg' })
  })

  it('right and left eye images can resolve to independent media types', () => {
    const right = parseImageDataUrl('data:image/png;base64,RIGHT')
    const left = parseImageDataUrl('data:image/jpeg;base64,LEFT')
    expect(right.mediaType).toBe('image/png')
    expect(left.mediaType).toBe('image/jpeg')
  })
})
