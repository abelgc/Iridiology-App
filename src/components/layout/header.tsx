'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function Header() {
  const router = useRouter()
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
    <header className="fixed top-0 left-64 right-0 border-b border-[oklch(0.88_0.02_80)] bg-[oklch(0.98_0.008_80)] h-16 flex items-center justify-between px-6 print:hidden">
      <h1 className="text-lg font-semibold text-[oklch(0.38_0.08_175)]">Narasimha Clay</h1>
      <div className="flex items-center gap-4">
        {userEmail && <span className="text-sm text-[oklch(0.50_0.03_60)]">{userEmail}</span>}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={isLoading}
          className="gap-2 text-[oklch(0.50_0.03_60)] hover:text-[oklch(0.22_0.04_50)]"
        >
          <LogOut className="size-4" />
          Logout
        </Button>
      </div>
    </header>
  )
}
