'use client'

import { useRouter } from 'next/navigation'
import { Button } from './button'
import { ArrowLeft } from 'lucide-react'

export function BackButton() {
  const router = useRouter()

  return (
    <Button
      onClick={() => router.back()}
      variant="ghost"
      size="sm"
      className="md:hidden mb-4"
    >
      <ArrowLeft className="mr-2" size={18} />
      Back
    </Button>
  )
}
