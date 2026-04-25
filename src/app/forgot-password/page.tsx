'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const [globalError, setGlobalError] = useState<string>('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setGlobalError('')
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        setGlobalError(error.message)
        return
      }
      setSuccess(true)
    } catch (err) {
      setGlobalError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: 'oklch(0.25 0.06 175)' }}
      >
        <Card
          className="w-full max-w-sm p-4 sm:p-8 mx-4 sm:mx-auto"
          style={{ background: 'oklch(0.98 0.008 80)', border: '1px solid oklch(0.88 0.02 80)' }}
        >
          <div className="text-center">
            <h2 className="text-xl font-bold mb-3" style={{ color: 'oklch(0.22 0.04 50)' }}>
              Check your email
            </h2>
            <p className="mb-6" style={{ color: 'oklch(0.50 0.03 60)' }}>
              We&apos;ve sent a password reset link to your email address. Click the link to continue.
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full">
                Back to Sign In
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: 'oklch(0.25 0.06 175)' }}
    >
      <Card
        className="w-full max-w-sm p-4 sm:p-8 mx-4 sm:mx-auto"
        style={{ background: 'oklch(0.98 0.008 80)', border: '1px solid oklch(0.88 0.02 80)' }}
      >
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/logo-solutions.png"
            alt="Narasimha Solutions"
            width={72}
            height={72}
            className="rounded-full object-cover mb-3"
            style={{ border: '2px solid oklch(0.68 0.12 65)' }}
          />
          <h1
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-serif)', color: 'oklch(0.22 0.04 50)' }}
          >
            Narasimha Solutions
          </h1>
          <p className="text-sm mt-1" style={{ color: 'oklch(0.50 0.03 60)', letterSpacing: '0.04em' }}>
            Reset Password
          </p>
        </div>

        {globalError && (
          <div className="mb-4 p-3 rounded text-sm" style={{ background: 'oklch(0.95 0.02 27)', border: '1px solid oklch(0.75 0.1 27)', color: 'oklch(0.45 0.18 27)' }}>
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'oklch(0.40 0.04 60)' }}>Email</label>
            <Input
              type="email"
              placeholder="your@email.com"
              autoComplete="email"
              {...register('email')}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm mt-1" style={{ color: 'oklch(0.55 0.2 27)' }}>{errors.email.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Sending…' : 'Send Recovery Link'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm hover:underline" style={{ color: 'oklch(0.50 0.08 270)' }}>
            Back to Sign In
          </Link>
        </div>
      </Card>
    </div>
  )
}
