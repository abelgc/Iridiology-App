'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut, Menu } from 'lucide-react'
import { useSidebar } from '@/lib/sidebar-state'

export function Header() {
  const router = useRouter()
  const { toggle } = useSidebar()
  const [userEmail, setUserEmail] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email || '')
      }
    }
    getUser()
  }, [])

  const handleLogout = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <header
      className="fixed top-0 left-0 md:left-64 right-0 h-16 flex items-center justify-between px-6 print:hidden z-30"
      style={{
        background: 'oklch(0.98 0.008 80)',
        borderBottom: '1px solid oklch(0.88 0.02 80)',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="md:hidden p-2 rounded-lg transition-colors"
          style={{ color: 'oklch(0.38 0.08 175)' }}
          aria-label="Toggle sidebar"
        >
          <Menu className="size-5" />
        </button>
        <h1
          className="text-lg font-semibold"
          style={{ fontFamily: 'var(--font-serif)', color: 'oklch(0.38 0.08 175)' }}
        >
          Narasimha Solutions
        </h1>
      </div>
      <div className="flex items-center gap-4">
        {userEmail && (
          <span className="text-sm hidden sm:block" style={{ color: 'oklch(0.50 0.03 60)' }}>
            {userEmail}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={isLoading}
          className="gap-2"
          style={{ color: 'oklch(0.50 0.03 60)' }}
        >
          <LogOut className="size-4" />
          Logout
        </Button>
      </div>
    </header>
  )
}
