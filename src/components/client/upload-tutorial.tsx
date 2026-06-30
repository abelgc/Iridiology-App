'use client'

import { useLanguage } from '@/lib/i18n-context'

export function UploadTutorial() {
  const { t } = useLanguage()
  return (
    <aside className="upload-tutorial-card">
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600, color: '#3d4a2a', marginBottom: 8 }}>
          {t('uploadTutorialHeading')}
        </p>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 8, overflow: 'hidden', marginBottom: 8, background: '#000' }}>
          <iframe
            src="https://player.vimeo.com/video/819893248?muted=1&badge=0&autopause=0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
        <p style={{ fontSize: 13, color: '#5a6a3a', margin: 0 }}>
          {t('uploadTutorialInstruction')}
        </p>
      </div>
    </aside>
  )
}
