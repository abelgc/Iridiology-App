'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, ScanEye, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Patients', href: '/patients', icon: Users },
  { label: 'New Session', href: '/sessions/new', icon: ScanEye },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col bg-[oklch(0.25_0.06_175)] text-[oklch(0.95_0.01_80)] print:hidden">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[oklch(0.32_0.07_175)]">
        <Image src="/logo.jpeg" alt="Narasimha Clay" width={44} height={44} className="rounded-full object-cover" />
        <div>
          <p className="font-semibold text-sm leading-tight text-[oklch(0.95_0.01_80)]">Narasimha Clay</p>
          <p className="text-xs text-[oklch(0.70_0.04_175)]">Iridology Analysis</p>
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
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
                isActive
                  ? 'bg-[oklch(0.68_0.12_65)] text-[oklch(0.22_0.04_50)]'
                  : 'text-[oklch(0.85_0.02_80)] hover:bg-[oklch(0.32_0.07_175)]'
              )}
            >
              <Icon className="size-5 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
