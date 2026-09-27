import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Narasimha Solutions — Iridology Analysis',
    short_name: 'Narasimha',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4ead8',
    theme_color: '#3d4a2a',
    icons: [{ src: '/icon.png', sizes: '256x256', type: 'image/png' }],
  }
}
