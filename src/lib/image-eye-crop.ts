import type { CropRect } from '@/lib/image-crop'

/** Width the eye is searched at; the thresholds were tuned on the face-heavy photos in docs/ at this size. */
const DETECT_WIDTH = 160
const MIN_EDGE_DENSITY = 0.03

interface Island {
  x0: number
  y0: number
  x1: number
  y1: number
  area: number
  sclera: number
  border: boolean
}

function median(values: Float32Array | Uint8Array): number {
  const sorted = Array.from(values).sort((a, b) => a - b)
  return sorted[sorted.length >> 1]
}

/**
 * Square crop around the eye, found from the sclera instead of the pupil, so iris and
 * pupil colour do not matter (light irises, flash-lit or red pupils). Skin is the most
 * common colour in the frame, so anything clearly less red than the median is "not skin";
 * the eye is the non-skin island that has bright sclera and hard edges (lashes, lid,
 * limbus) around it. Returns null when nothing looks like an eye.
 *
 * `rgba` uses the canvas ImageData layout, length width*height*4.
 */
export function estimateEyeCrop(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): CropRect | null {
  const n = width * height
  if (width < 32 || height < 32 || rgba.length < n * 4) return null

  const redness = new Float32Array(n)
  const value = new Uint8Array(n)
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    redness[p] = r - (g + b) / 2
    value[p] = Math.max(r, g, b)
  }
  const medRed = median(redness)
  const medV = median(value)

  const nonSkin = new Uint8Array(n)
  for (let p = 0; p < n; p++) if (redness[p] <= medRed - 20) nonSkin[p] = 1

  const label = new Int32Array(n).fill(-1)
  const islands: Island[] = []
  const stack: number[] = []
  for (let s = 0; s < n; s++) {
    if (!nonSkin[s] || label[s] >= 0) continue
    const id = islands.length
    const island: Island = { x0: width, y0: height, x1: -1, y1: -1, area: 0, sclera: 0, border: false }
    label[s] = id
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()!
      const x = p % width
      const y = (p - x) / width
      island.area++
      if (value[p] >= medV * 0.8) island.sclera++
      if (x < island.x0) island.x0 = x
      if (x > island.x1) island.x1 = x
      if (y < island.y0) island.y0 = y
      if (y > island.y1) island.y1 = y
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) island.border = true
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ]
      for (const q of neighbours) {
        if (q >= 0 && nonSkin[q] && label[q] < 0) {
          label[q] = id
          stack.push(q)
        }
      }
    }
    islands.push(island)
  }

  const edgeDensity = (island: Island) => {
    const mx = Math.round((island.x1 - island.x0 + 1) * 0.3) + 1
    const my = Math.round((island.y1 - island.y0 + 1) * 0.3) + 1
    let strong = 0
    let total = 0
    for (let y = Math.max(1, island.y0 - my); y <= Math.min(height - 2, island.y1 + my); y++) {
      for (let x = Math.max(1, island.x0 - mx); x <= Math.min(width - 2, island.x1 + mx); x++) {
        const p = y * width + x
        const g = Math.abs(value[p + 1] - value[p - 1]) + Math.abs(value[p + width] - value[p - width])
        if (g > 60) strong++
        total++
      }
    }
    return total ? strong / total : 0
  }

  // Background touches the frame edge; a skin highlight is smooth; both are rejected here.
  const minArea = n * 0.0008
  let best: Island | null = null
  let bestScore = 0
  for (const island of islands) {
    if (island.border || island.area < minArea || island.sclera < minArea / 4) continue
    const w = island.x1 - island.x0 + 1
    const h = island.y1 - island.y0 + 1
    if (w < h * 0.5 || w > h * 6) continue
    const edges = edgeDensity(island)
    if (edges < MIN_EDGE_DENSITY) continue
    const score = island.sclera * edges
    if (score > bestScore) {
      bestScore = score
      best = island
    }
  }
  if (!best) return null

  // A dark iris splits the sclera into two islands at the same height: join them.
  let { x0, y0, x1, y1 } = best
  const reach = best.x1 - best.x0 + 1
  for (const island of islands) {
    if (island === best || island.border || island.area < minArea / 4) continue
    const gapX = Math.max(0, island.x0 - best.x1, best.x0 - island.x1)
    const overlapsVertically = island.y0 <= best.y1 && island.y1 >= best.y0
    if (gapX <= reach && overlapsVertically) {
      x0 = Math.min(x0, island.x0)
      y0 = Math.min(y0, island.y0)
      x1 = Math.max(x1, island.x1)
      y1 = Math.max(y1, island.y1)
    }
  }

  const side = Math.min(Math.max(x1 - x0 + 1, y1 - y0 + 1) * 1.5, width, height)
  const cx = (x0 + x1 + 1) / 2
  const cy = (y0 + y1 + 1) / 2
  const x = Math.round(Math.min(Math.max(0, cx - side / 2), width - side))
  const y = Math.round(Math.min(Math.max(0, cy - side / 2), height - side))
  return { x, y, width: Math.round(side), height: Math.round(side) }
}

/** Eye crop in the image's own pixel space, or null when no eye is found. */
export function findIrisCrop(image: HTMLImageElement): CropRect | null {
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (typeof document === 'undefined' || width < 32 || height < 32) return null

  const detectH = Math.max(1, Math.round((height * DETECT_WIDTH) / width))
  const canvas = document.createElement('canvas')
  canvas.width = DETECT_WIDTH
  canvas.height = detectH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, DETECT_WIDTH, detectH)
  const found = estimateEyeCrop(ctx.getImageData(0, 0, DETECT_WIDTH, detectH).data, DETECT_WIDTH, detectH)
  if (!found) return null

  const scale = width / DETECT_WIDTH
  const side = Math.min(Math.round(found.width * scale), width, height)
  const x = Math.min(Math.max(0, Math.round(found.x * scale)), width - side)
  const y = Math.min(Math.max(0, Math.round(found.y * scale)), height - side)
  return side >= 32 ? { x, y, width: side, height: side } : null
}
