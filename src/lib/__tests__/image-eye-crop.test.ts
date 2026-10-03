import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { estimateEyeCrop } from '../image-eye-crop'

// RGB of the two face-heavy photos in docs/, resized the same way the detector
// does (160 px wide, PIL bilinear). Pupil coordinates are on the original 720×1280 frames.

const FULL_W = 720
const FULL_H = 1280

type Rgb = [number, number, number]

function loadRgba(name: string): { width: number; height: number; rgba: Uint8Array } {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', name))
  const width = buf.readUInt16LE(0)
  const height = buf.readUInt16LE(2)
  const rgb = buf.subarray(4)
  const rgba = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = rgb[p * 3]
    rgba[p * 4 + 1] = rgb[p * 3 + 1]
    rgba[p * 4 + 2] = rgb[p * 3 + 2]
    rgba[p * 4 + 3] = 255
  }
  return { width, height, rgba }
}

function paintDisk(
  src: Uint8Array,
  width: number,
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  color: Rgb,
): Uint8Array {
  const out = new Uint8Array(src)
  for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
    for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d >= inner && d <= outer) {
        const i = (y * width + x) * 4
        out[i] = color[0]
        out[i + 1] = color[1]
        out[i + 2] = color[2]
      }
    }
  }
  return out
}

function coversPupil(
  crop: { x: number; y: number; width: number; height: number } | null,
  frameW: number,
  frameH: number,
  pupilX: number,
  pupilY: number,
) {
  if (!crop) return { inside: false, area: 0 }
  const area = (crop.width * crop.height) / (frameW * frameH)
  const inside = pupilX > crop.x && pupilX < crop.x + crop.width && pupilY > crop.y && pupilY < crop.y + crop.height
  return { inside, area }
}

const BROWN: Rgb = [95, 58, 36]
const DARK_BROWN: Rgb = [45, 28, 20]
const GREEN: Rgb = [95, 120, 80]
const FLASH: Rgb = [235, 235, 235]
const RED_PUPIL: Rgb = [200, 40, 40]

function variants(rgba: Uint8Array, width: number, cx: number, cy: number, radius: number) {
  const iris = (color: Rgb) => paintDisk(rgba, width, cx, cy, radius * 0.35, radius, color)
  return {
    'as captured': rgba,
    'flash-lit pupil': paintDisk(rgba, width, cx, cy, 0, radius * 0.35, FLASH),
    'red pupil': paintDisk(rgba, width, cx, cy, 0, radius * 0.35, RED_PUPIL),
    'brown iris': iris(BROWN),
    'dark brown iris with flash': paintDisk(iris(DARK_BROWN), width, cx, cy, 0, radius * 0.35, FLASH),
    'green iris': iris(GREEN),
  }
}

describe('estimateEyeCrop finds the eye from the sclera, whatever the iris colour', () => {
  const photos = [
    { name: 'adi-left-rgb.bin', pupilX: 337, pupilY: 441, radius: 12 },
    { name: 'adi-right-rgb.bin', pupilX: 369, pupilY: 535, radius: 12 },
  ] as const

  for (const photo of photos) {
    const { width, height, rgba } = loadRgba(photo.name)
    const cx = (photo.pupilX * width) / FULL_W
    const cy = (photo.pupilY * height) / FULL_H
    const painted = variants(rgba, width, cx, cy, photo.radius)

    for (const [label, frame] of Object.entries(painted)) {
      it(`${photo.name}: ${label}`, () => {
        const crop = estimateEyeCrop(frame, width, height)
        const { inside, area } = coversPupil(crop, width, height, cx, cy)
        expect(inside, `${label} crop ${JSON.stringify(crop)}`).toBe(true)
        expect(area).toBeLessThan(0.25)
        expect(area).toBeGreaterThan(0.02)
      })
    }
  }

  it('returns null on a flat skin-coloured frame so the caller keeps the whole photo', () => {
    const width = 160
    const height = 284
    const rgba = new Uint8Array(width * height * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 180
      rgba[i + 1] = 120
      rgba[i + 2] = 110
      rgba[i + 3] = 255
    }
    expect(estimateEyeCrop(rgba, width, height)).toBeNull()
  })
})
