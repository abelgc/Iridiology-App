'use client'

import { useLanguage } from '@/lib/i18n-context'

const TUTORIAL_URL = 'https://vimeo.com/819893248'

export function UploadTutorial() {
  const { t } = useLanguage()
  return (
    <aside className="upload-tutorial-card">
      <span className="upload-tutorial-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
      </span>
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600, color: '#3d4a2a', marginBottom: 2 }}>
          {t('uploadTutorialHeading')}
        </p>
        <a
          href={TUTORIAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#a85428', fontSize: 13, fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          {t('uploadTutorialLinkLabel')} ↗
        </a>
      </div>
    </aside>
  )
}
