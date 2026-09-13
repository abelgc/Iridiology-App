import { describe, it, expect } from 'vitest'
import { autoContrastInPlace } from '../image-enhance'

// Regression test: Ana Iranzo's real /practitioner report (2026-09-13) showed a dark,
// eyelid-shadowed iris capture read by the model as almost entirely "obscured". Both
// image-upload.tsx (practitioner) and iris-image-upload.tsx (client) call this function,
// in place, on the cropped canvas's real pixel data before it reaches the model — pure array
// math, no canvas/DOM needed to observe its real behavior.

describe('autoContrastInPlace', () => {
  it('stretches a dark, low-contrast cluster toward the full 0-255 range', () => {
    // 2x2 RGBA image, all pixels dark and clustered between 50 and 100 — representative of
    // an eyelid-shadowed iris capture.
    const pixels = Uint8ClampedArray.from([
      50, 50, 50, 255,
      100, 100, 100, 255,
      60, 60, 60, 255,
      90, 90, 90, 255,
    ])
    autoContrastInPlace(pixels, 0)
    expect(pixels[0]).toBe(0) // darkest (50) stretches to black
    expect(pixels[4]).toBe(255) // brightest (100) stretches to white
    expect(pixels[8]).toBe(51) // 60 stretches proportionally
    expect(pixels[12]).toBe(204) // 90 stretches proportionally
  })

  it('leaves an already full-range image unchanged', () => {
    const pixels = Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 255])
    const before = Uint8ClampedArray.from(pixels)
    autoContrastInPlace(pixels, 0)
    expect(Array.from(pixels)).toEqual(Array.from(before))
  })

  it('does not crash or divide by zero on a flat, single-colour image', () => {
    const pixels = Uint8ClampedArray.from([128, 128, 128, 255, 128, 128, 128, 255])
    expect(() => autoContrastInPlace(pixels)).not.toThrow()
    expect(pixels[0]).toBe(128)
  })

  it('clips outlier tail pixels so they do not collapse the stretch for the real bulk of the image', () => {
    // 61-value bulk cluster (100-160) plus one pure-black and one pure-white outlier pixel —
    // e.g. a specular reflection or a camera artifact. Without clipping, the two outliers
    // already span the full range, so the bulk barely moves. With clipping, the outliers are
    // excluded from the stretch bounds and the real iris data uses the full range instead.
    const bulk: number[] = []
    for (let v = 100; v <= 160; v++) bulk.push(v)
    const values = [0, ...bulk, 255]

    const withoutClipping = Uint8ClampedArray.from(values.flatMap((v) => [v, v, v, 255]))
    autoContrastInPlace(withoutClipping, 0)
    expect(withoutClipping[1 * 4]).toBe(100) // bulk-min (100) barely moved — outliers already spanned 0-255

    const withClipping = Uint8ClampedArray.from(values.flatMap((v) => [v, v, v, 255]))
    autoContrastInPlace(withClipping, 0.05)
    expect(withClipping[1 * 4]).toBeLessThan(50) // bulk-min (100) stretched down toward black
    expect(withClipping[61 * 4]).toBeGreaterThan(200) // bulk-max (160) stretched up toward white
  })
})
