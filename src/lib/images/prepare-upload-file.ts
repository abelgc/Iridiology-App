const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
}

function extension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function isPhotoFile(file: File) {
  if (file.type.startsWith('image/')) return true
  return extension(file.name) in EXT_MIME
}

function isHeic(file: File) {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  const ext = extension(file.name)
  return ext === 'heic' || ext === 'heif'
}

export async function prepareUploadFile(file: File): Promise<File> {
  if (!isPhotoFile(file)) throw new Error('not-image')
  const mime = file.type.startsWith('image/') ? file.type : EXT_MIME[extension(file.name)]
  const typed = mime === file.type ? file : new File([file], file.name, { type: mime })
  if (!isHeic(typed)) return typed
  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({ blob: typed, toType: 'image/jpeg', quality: 0.92 })
  const blob = Array.isArray(converted) ? converted[0] : converted
  return new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' })
}
