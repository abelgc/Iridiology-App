import { ReactNode } from 'react'
import { LanguageProvider } from '@/lib/i18n-context'
import { LanguageToggle } from '@/components/client/language-toggle'

export const metadata = { title: 'Iridology Analysis' }

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-[oklch(0.98_0.008_80)] text-[oklch(0.22_0.04_50)]">
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <h1 className="font-semibold">Iridology Analysis</h1>
          <LanguageToggle />
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
      </div>
    </LanguageProvider>
  )
}
