import { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LanguageProvider } from '@/lib/i18n-context'

export const metadata = { title: 'Narasimha Solutions — Iridology Analysis' }

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <div className="min-h-screen" style={{ background: 'oklch(0.98 0.008 80)', color: 'oklch(0.22 0.04 50)' }}>
        <header
          className="flex items-center px-6 py-4"
          style={{ background: 'oklch(0.25 0.06 175)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Link href="/client" className="flex items-center gap-3">
            <Image
              src="/logo-solutions.png"
              alt="Narasimha Solutions"
              width={38}
              height={38}
              className="rounded-full object-cover"
              style={{ border: '2px solid oklch(0.68 0.12 65)' }}
            />
            <div>
              <p
                className="font-semibold text-sm leading-tight"
                style={{ fontFamily: 'var(--font-serif)', color: 'oklch(0.95 0.01 80)' }}
              >
                Narasimha Solutions
              </p>
              <p className="text-xs" style={{ color: 'oklch(0.75 0.08 65)', letterSpacing: '0.04em' }}>
                Iridology Analysis
              </p>
            </div>
          </Link>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
      </div>
    </LanguageProvider>
  )
}
