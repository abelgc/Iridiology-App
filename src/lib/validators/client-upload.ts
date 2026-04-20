import { z } from 'zod'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATA_URL_PREFIX = /^data:image\/(jpeg|png);base64,/

export const clientUploadSchema = z.object({
  report_download_token: z.string().regex(UUID_V4),
  right_eye_base64: z.string().regex(DATA_URL_PREFIX),
  left_eye_base64: z.string().regex(DATA_URL_PREFIX),
})

export type ClientUploadInput = z.infer<typeof clientUploadSchema>
