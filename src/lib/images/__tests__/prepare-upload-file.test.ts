import { describe, it, expect } from 'vitest'
import { isPhotoFile, prepareUploadFile } from '../prepare-upload-file'

describe('prepareUploadFile', () => {
  it('treats a .heic with an empty MIME type as a photo', () => {
    expect(isPhotoFile(new File(['x'], 'iris.heic', { type: '' }))).toBe(true)
  })

  it('rejects a text file', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    expect(isPhotoFile(file)).toBe(false)
    await expect(prepareUploadFile(file)).rejects.toThrow('not-image')
  })

  it('fills an empty MIME type from the extension', async () => {
    const prepared = await prepareUploadFile(new File(['x'], 'eye.webp', { type: '' }))
    expect(prepared.type).toBe('image/webp')
  })
})
