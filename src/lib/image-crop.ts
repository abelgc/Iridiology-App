export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Computes a centred crop rectangle at `keepRatio` of the source dimensions — a conservative
 * heuristic (not iris detection), used before resizing so the compression budget is spent on
 * the eye rather than the periocular skin/eyelid/eyebrow a raw capture also includes. Assumes
 * reasonably centred framing; see the P2 image-pipeline diagnosis referenced by the
 * iridology-app-map skill.
 */
export function computeCenterCrop(sourceWidth: number, sourceHeight: number, keepRatio: number): CropRect {
  const width = Math.round(sourceWidth * keepRatio)
  const height = Math.round(sourceHeight * keepRatio)
  const x = Math.round((sourceWidth - width) / 2)
  const y = Math.round((sourceHeight - height) / 2)
  return { x, y, width, height }
}
