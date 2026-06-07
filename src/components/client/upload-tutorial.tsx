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
        <video
          src="/iris_cut.mp4"
          controls
          playsInline
          style={{ width: '100%', borderRadius: 8, marginBottom: 8, background: '#000' }}
        />
        <p style={{ fontSize: 13, color: '#5a6a3a', margin: 0 }}>
          {t('uploadTutorialInstruction')}
        </p>
      </div>
    </aside>
  )
}
