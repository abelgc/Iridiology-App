'use client'

import { Patient, Session } from '@/types/database'
import { calculateAge, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PatientCardProps {
  patient: Patient
  lastSession?: Session | null
}

export function PatientCard({ patient, lastSession }: PatientCardProps) {
  const age = patient.date_of_birth ? calculateAge(patient.date_of_birth) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{patient.full_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {age && <div>Age: {age} years old</div>}
        {patient.gender && <div>Gender: {patient.gender}</div>}
        {patient.email && <div>Email: {patient.email}</div>}
        {patient.phone && <div>Phone: {patient.phone}</div>}
        {lastSession && (
          <div>Last Session: {formatDate(lastSession.session_date)}</div>
        )}
      </CardContent>
    </Card>
  )
}
