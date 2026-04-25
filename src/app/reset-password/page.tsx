'use client'

import { Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [globalError, setGlobalError] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(true)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  useEffect(() => {
    const verifyCode = async () => {
      if (!code || type !== 'recovery') {
        setGlobalError('Invalid or missing recovery code')
        setIsVerifying(false)
        return
      }
      setIsVerifying(false)
    }

    verifyCode()
  }, [code, type])

  const onSubmit = async (data: ResetPasswordFormData) => {
    setGlobalError('')
    setIsLoading(true)
    try {
      const supabase = createClient()

      const { error: updateError } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (updateError) {
        setGlobalError(updateError.message)
        return
      }

      router.push('/login?message=Password updated successfully')
    } catch (err) {
      setGlobalError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  if (isVerifying) {
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
            <p style={{ color: 'oklch(0.50 0.03 60)' }}>Loading...</p>
          </div>
        </Card>
      </div>
    )
  }

  if (globalError && !code) {
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
              Invalid Reset Link
            </h2>
            <p className="mb-6" style={{ color: 'oklch(0.50 0.03 60)' }}>
              {globalError}
            </p>
            <Button onClick={() => router.push('/forgot-password')} className="w-full">
              Request New Link
            </Button>
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
            Set New Password
          </p>
        </div>

        {globalError && (
          <div className="mb-4 p-3 rounded text-sm" style={{ background: 'oklch(0.95 0.02 27)', border: '1px solid oklch(0.75 0.1 27)', color: 'oklch(0.45 0.18 27)' }}>
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'oklch(0.40 0.04 60)' }}>New Password</label>
            <Input
              type="password"
              placeholder="••••••"
              autoComplete="new-password"
              {...register('password')}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="text-sm mt-1" style={{ color: 'oklch(0.55 0.2 27)' }}>{errors.password.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'oklch(0.40 0.04 60)' }}>Confirm Password</label>
            <Input
              type="password"
              placeholder="••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && (
              <p className="text-sm mt-1" style={{ color: 'oklch(0.55 0.2 27)' }}>{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Updating…' : 'Update Password'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ background: 'oklch(0.25 0.06 175)', minHeight: '100vh' }} />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
