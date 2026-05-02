import { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LanguageProvider } from '@/lib/i18n-context'
import { LanguageToggle } from '@/components/client/language-toggle'

export const metadata = { title: 'Narasimha Solutions — Iridology Analysis' }

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <div style={{ minHeight: '100vh', background: '#f4ead8', color: '#2a1f14', fontFamily: 'var(--font-sans)' }}>
        <div style={{ background: '#3d4a2a', color: '#f4ead8', textAlign: 'center', fontSize: '11px', letterSpacing: '0.1em', padding: '8px 16px', textTransform: 'uppercase', fontWeight: 500 }}>
          Natural Wellness · Real Insight · Caring Guidance
        </div>
        <header style={{ background: '#f4ead8', borderBottom: '1px solid #d8c9ad', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
          <Link href="/client" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <Image
              src="/logo-solutions.png"
              alt="Narasimha Solutions"
              width={46}
              height={46}
              className="rounded-full object-cover"
              style={{ border: '2px solid #d4a04a' }}
            />
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, color: '#3d4a2a', lineHeight: 1.1 }}>
                Narasimha Solutions
              </p>
              <p style={{ fontSize: '10px', color: '#5d4f3f', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>
                Iris Reading
              </p>
            </div>
          </Link>
          <LanguageToggle />
        </header>
        <main>{children}</main>
      </div>
    </LanguageProvider>
  )
}
