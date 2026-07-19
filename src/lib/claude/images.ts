export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/

/**
 * Parses a value that may be a full `data:<mediaType>;base64,<data>` URL or a bare
 * base64 payload. Returns the actual declared media type when present, falling back
 * to 'image/jpeg' only when no data URL prefix is found (e.g. the practitioner upload
 * path, which already strips the prefix client-side and always encodes JPEG).
 */
export function parseImageDataUrl(value: string): { data: string; mediaType: ImageMediaType } {
  const match = value.match(DATA_URL_RE)
  if (match) {
    return { data: match[2], mediaType: match[1] as ImageMediaType }
  }
  return { data: value, mediaType: 'image/jpeg' }
}
