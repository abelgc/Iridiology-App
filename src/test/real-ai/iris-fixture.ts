import path from 'node:path'
import sharp from 'sharp'
import { estimateEyeCrop } from '@/lib/image-eye-crop'
import { autoContrastInPlace } from '@/lib/image-enhance'

// The only committed photo with a visible iris (e2e/fixtures/iris-*.jpg are flat colour
// squares, src/lib/__tests__/fixtures/*.bin are 160px thumbnails). It is a left eye; the
// suite sends it for both eyes because no committed right-eye photo exists.
export const IRIS_FIXTURE = path.resolve(process.cwd(), 'e2e/fixtures/face-eye-left.jpg')

const DETECT_WIDTH = 160
const MAX_DIM = 1536
const JPEG_QUALITY = 80

// Node port of compressImage() in src/components/client/iris-image-upload.tsx: find the eye
// at 160px wide, crop a square around it (or keep the whole frame), cap at 1536px,
// auto-contrast, JPEG at quality 0.8, then a data URL, the same payload the upload route gets.
export async function clientUploadDataUrl(file: string = IRIS_FIXTURE): Promise<{ dataUrl: string; crop: string }> {
  const source = sharp(file).rotate()
  const { width, height } = await source.metadata()
  if (!width || !height) throw new Error(`cannot read ${file}`)

  const detectH = Math.max(1, Math.round((height * DETECT_WIDTH) / width))
  const small = await sharp(file).rotate().resize(DETECT_WIDTH, detectH, { fit: 'fill' }).ensureAlpha().raw().toBuffer()
  const found = estimateEyeCrop(new Uint8ClampedArray(small), DETECT_WIDTH, detectH)

  let crop = { x: 0, y: 0, width, height }
  if (found) {
    const scale = width / DETECT_WIDTH
    const side = Math.min(Math.round(found.width * scale), width, height)
    const x = Math.min(Math.max(0, Math.round(found.x * scale)), width - side)
    const y = Math.min(Math.max(0, Math.round(found.y * scale)), height - side)
    if (side >= 32) crop = { x, y, width: side, height: side }
  }

  const scale = Math.min(1, MAX_DIM / Math.max(crop.width, crop.height))
  const outW = Math.round(crop.width * scale)
  const outH = Math.round(crop.height * scale)
  const rgba = await sharp(file)
    .rotate()
    .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .resize(outW, outH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer()
  const pixels = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength)
  autoContrastInPlace(pixels)
  const jpeg = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width: outW, height: outH, channels: 4 },
  })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()

  return {
    dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    crop: found ? `eye found, ${crop.width}x${crop.height} at ${crop.x},${crop.y}` : `no eye found, whole ${width}x${height} frame`,
  }
}
