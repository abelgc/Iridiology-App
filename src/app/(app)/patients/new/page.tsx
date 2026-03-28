'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PatientForm } from '@/components/patients/patient-form'
import { PatientCreateInput } from '@/lib/validators/patient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function NewPatientPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (data: PatientCreateInput) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create patient')
      }

      const newPatient = await response.json()
      toast({
        title: 'Success',
        description: 'Patient created successfully',
      })
      router.push(`/patients/${newPatient.id}`)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create patient',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold">Create New Patient</h1>
        <Card>
          <CardContent className="pt-6">
            <PatientForm onSubmit={handleSubmit} isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
