export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const
export const MIN_DIMENSION = 800

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: 'too_large' | 'bad_format' | 'too_small' }

export async function validateImage(
  blob: Blob,
  dimensions: { width: number; height: number },
): Promise<ValidationResult> {
  if (blob.size > IMAGE_MAX_BYTES) {
    return { ok: false, reason: 'too_large' }
  }
  if (!ALLOWED_MIME_TYPES.includes(blob.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { ok: false, reason: 'bad_format' }
  }
  if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
    return { ok: false, reason: 'too_small' }
  }
  return { ok: true }
}

export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}
