'use client'

import { useLanguage } from '@/lib/i18n-context'

const TUTORIAL_URL = 'https://vimeo.com/819893248'

export function UploadTutorial() {
  const { t } = useLanguage()
  return (
    <aside className="border rounded-md p-4 bg-white mb-6">
      <h3 className="font-medium mb-2">{t('uploadTutorialHeading')}</h3>
      <a
        href={TUTORIAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-[oklch(0.25_0.06_175)]"
      >
        {t('uploadTutorialLinkLabel')} ↗
      </a>
    </aside>
  )
}
