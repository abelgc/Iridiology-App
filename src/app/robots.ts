import type { MetadataRoute } from 'next'

// Crawlers request /robots.txt before generating a link preview. Without this
// the route fell through to the auth proxy and answered with a redirect to
// /login, which is not a robots file — so the scrape was abandoned and shared
// links came out with no image.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Practitioner area is login-only and the API is not browsable.
        disallow: ['/api/', '/practitioner'],
      },
    ],
  }
}
