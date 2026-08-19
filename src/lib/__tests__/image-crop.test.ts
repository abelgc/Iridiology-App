import { describe, it, expect } from 'vitest'
import { computeCenterCrop } from '../image-crop'

// Regression test for P2 (image pipeline sending unnecessary periocular skin/eyelid to the
// model): computeCenterCrop is the real function both image-upload.tsx (practitioner) and
// iris-image-upload.tsx (client) call before resizing. Pure geometry — no canvas/DOM needed
// to observe its real behavior.

describe('computeCenterCrop', () => {
  it('crops to the requested ratio, centred on the source', () => {
    const crop = computeCenterCrop(2000, 1500, 0.75)

    expect(crop.width).toBe(1500)
    expect(crop.height).toBe(1125)
    expect(crop.x).toBe(250) // (2000 - 1500) / 2
    expect(crop.y).toBe(188) // round((1500 - 1125) / 2) = round(187.5)
  })

  it('never produces a rectangle outside the source bounds', () => {
    // A handful of realistic and edge-case dimensions, including odd ones that don't divide evenly.
    const cases: Array<[number, number, number]> = [
      [1920, 1080, 0.75],
      [1079, 1081, 0.75],
      [4032, 3024, 0.5],
      [1, 1, 0.75],
    ]

    for (const [w, h, ratio] of cases) {
      const crop = computeCenterCrop(w, h, ratio)
      expect(crop.x).toBeGreaterThanOrEqual(0)
      expect(crop.y).toBeGreaterThanOrEqual(0)
      expect(crop.x + crop.width).toBeLessThanOrEqual(w)
      expect(crop.y + crop.height).toBeLessThanOrEqual(h)
    }
  })

  it('a ratio of 1.0 is a no-op crop covering the full source', () => {
    const crop = computeCenterCrop(1200, 800, 1)
    expect(crop).toEqual({ x: 0, y: 0, width: 1200, height: 800 })
  })

  it('stays centred for a portrait (taller-than-wide) source, the common phone-camera shape', () => {
    const crop = computeCenterCrop(1080, 1920, 0.75)
    expect(crop.width).toBe(810)
    expect(crop.height).toBe(1440)
    expect(crop.x).toBe(135)
    expect(crop.y).toBe(240)
  })
})
