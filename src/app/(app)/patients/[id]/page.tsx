import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, calculateAge } from '@/lib/utils'
import Link from 'next/link'
import { SessionsTable } from '@/components/patients/sessions-table'

interface PatientDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function PatientDetailPage({
  params,
}: PatientDetailPageProps) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: patient, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !patient) {
    notFound()
  }

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('patient_id', id)
    .order('session_date', { ascending: false })

  const sessionsList = sessions || []

  const age = patient.date_of_birth ? calculateAge(patient.date_of_birth) : null

  return (
    <div className="space-y-6 p-8">
      <BackButton />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{patient.full_name}</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/patients/${id}/edit`}>Edit Patient</Link>
          </Button>
          <Button asChild>
            <Link href={`/sessions/new?patientId=${id}`}>New Session</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {age && (
              <div>
                <span className="font-medium">Age:</span> {age} years old
              </div>
            )}
            {patient.date_of_birth && (
              <div>
                <span className="font-medium">Date of Birth:</span>{' '}
                {formatDate(patient.date_of_birth)}
              </div>
            )}
            {patient.gender && (
              <div>
                <span className="font-medium">Gender:</span> {patient.gender}
              </div>
            )}
            {patient.email && (
              <div>
                <span className="font-medium">Email:</span> {patient.email}
              </div>
            )}
            {patient.phone && (
              <div>
                <span className="font-medium">Phone:</span> {patient.phone}
              </div>
            )}
            {patient.general_history && (
              <div>
                <span className="font-medium">General History:</span>
                <p className="mt-1 text-gray-600">{patient.general_history}</p>
              </div>
            )}
            {patient.notes && (
              <div>
                <span className="font-medium">Notes:</span>
                <p className="mt-1 text-gray-600">{patient.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="font-medium">Total Sessions:</span> {sessionsList.length}
            </div>
            {sessionsList.length > 0 && (
              <div>
                <span className="font-medium">Last Session:</span>{' '}
                {formatDate(sessionsList[0].session_date)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {sessionsList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionsTable sessions={sessionsList} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
