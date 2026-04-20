import { describe, it, expect } from 'vitest'
import { clientUploadSchema } from '@/lib/validators/client-upload'

describe('clientUploadSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = clientUploadSchema.parse({
      report_download_token: '00000000-0000-4000-8000-000000000000',
      right_eye_base64: 'data:image/jpeg;base64,AAA',
      left_eye_base64: 'data:image/jpeg;base64,BBB',
    })
    expect(parsed.right_eye_base64.startsWith('data:image/')).toBe(true)
  })

  it('rejects non-data-url images', () => {
    expect(() =>
      clientUploadSchema.parse({
        report_download_token: '00000000-0000-4000-8000-000000000000',
        right_eye_base64: 'AAA',
        left_eye_base64: 'BBB',
      }),
    ).toThrow()
  })

  it('rejects bad token', () => {
    expect(() =>
      clientUploadSchema.parse({
        report_download_token: 'not-a-uuid',
        right_eye_base64: 'data:image/jpeg;base64,AAA',
        left_eye_base64: 'data:image/jpeg;base64,BBB',
      }),
    ).toThrow()
  })
})
