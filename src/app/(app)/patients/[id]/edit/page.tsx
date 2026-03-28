'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PatientForm } from '@/components/patients/patient-form'
import { PatientCreateInput } from '@/lib/validators/patient'
import { Card, CardContent } from '@/components/ui/card'
import { Patient } from '@/types/database'
import { useToast } from '@/hooks/use-toast'

interface PatientEditPageProps {
  params: Promise<{ id: string }>
}

export default function PatientEditPage({ params }: PatientEditPageProps) {
  const [id, setId] = useState<string>()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    async function loadParams() {
      const resolvedParams = await params
      setId(resolvedParams.id)
    }
    loadParams()
  }, [params])

  useEffect(() => {
    if (!id) return

    async function loadPatient() {
      try {
        const response = await fetch(`/api/patients/${id}`)
        if (!response.ok) throw new Error('Failed to load patient')
        const data = await response.json()
        setPatient(data)
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load patient',
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadPatient()
  }, [id, toast])

  const handleSubmit = async (data: PatientCreateInput) => {
    if (!id) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/patients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update patient')
      }

      toast({
        title: 'Success',
        description: 'Patient updated successfully',
      })
      router.push(`/patients/${id}`)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update patient',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="p-8">Loading...</div>
  }

  if (!patient) {
    return <div className="p-8">Patient not found</div>
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold">Edit Patient</h1>
        <Card>
          <CardContent className="pt-6">
            <PatientForm
              patient={patient}
              onSubmit={handleSubmit}
              isLoading={isSubmitting}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
