'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, ScanEye, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-state'

const navItems = [
  { label: 'Dashboard', href: '/practitioner', icon: LayoutDashboard },
  { label: 'Patients', href: '/practitioner/patients', icon: Users },
  { label: 'New Session', href: '/practitioner/sessions/new', icon: ScanEye },
  { label: 'Settings', href: '/practitioner/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isOpen, close } = useSidebar()

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={close}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 flex flex-col print:hidden',
          'transition-transform duration-300 ease-in-out',
          'md:translate-x-0 md:block',
          isOpen ? 'translate-x-0 z-50' : '-translate-x-full md:translate-x-0',
        )}
        style={{ background: 'oklch(0.25 0.06 175)', color: 'oklch(0.95 0.01 80)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Image
            src="/logo-solutions.png"
            alt="Narasimha Solutions"
            width={44}
            height={44}
            className="rounded-full object-cover"
            style={{ border: '2px solid oklch(0.68 0.12 65)' }}
          />
          <div>
            <p className="font-semibold text-sm leading-tight" style={{ fontFamily: 'var(--font-serif)', color: 'oklch(0.95 0.01 80)' }}>
              Narasimha Solutions
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'oklch(0.75 0.08 65)', letterSpacing: '0.04em' }}>
              Iridology Analysis
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={close}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
                  isActive
                    ? 'text-[oklch(0.22_0.04_50)]'
                    : 'text-[oklch(0.85_0.02_80)] hover:bg-[oklch(0.32_0.07_175)]'
                )}
                style={isActive ? { background: 'oklch(0.68 0.12 65)' } : {}}
              >
                <Icon className="size-5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs" style={{ color: 'rgba(250,247,242,0.35)' }}>© 2026 Narasimha Solutions</p>
        </div>
      </aside>
    </>
  )
}
