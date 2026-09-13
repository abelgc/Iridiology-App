/**
 * Applies a percentile-clipped, per-channel linear contrast stretch ("auto levels") in place —
 * compensates for underexposed or shadow-heavy iris captures (eyelid shadow, poor lighting)
 * before the image reaches the model. Clips the given percentile at each histogram tail before
 * stretching, so a handful of pure-black or specular-highlight pixels can't collapse the whole
 * stretch. A well-exposed image is already close to full-range, so this is close to a no-op
 * there — safe to apply unconditionally.
 */
export function autoContrastInPlace(pixels: Uint8ClampedArray, clipPercentile = 0.01): void {
  for (let channel = 0; channel < 3; channel++) {
    const histogram = new Uint32Array(256)
    let count = 0
    for (let i = channel; i < pixels.length; i += 4) {
      histogram[pixels[i]]++
      count++
    }
    if (count === 0) continue

    const clipCount = Math.floor(count * clipPercentile)

    let lo = 0
    let accLo = 0
    for (; lo < 255; lo++) {
      accLo += histogram[lo]
      if (accLo > clipCount) break
    }

    let hi = 255
    let accHi = 0
    for (; hi > 0; hi--) {
      accHi += histogram[hi]
      if (accHi > clipCount) break
    }

    if (hi <= lo) continue // degenerate/flat channel after clipping — nothing to stretch

    const scale = 255 / (hi - lo)
    for (let i = channel; i < pixels.length; i += 4) {
      pixels[i] = Math.max(0, Math.min(255, Math.round((pixels[i] - lo) * scale)))
    }
  }
}
