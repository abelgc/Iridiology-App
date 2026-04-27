'use client'

import { Patient } from '@/types/database'
import { calculateAge, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'

type PatientWithSessions = Patient & { sessions?: { created_at: string }[] | null }

interface PatientListProps {
  patients: PatientWithSessions[]
}

function getLastSession(sessions?: { created_at: string }[] | null): string {
  if (!sessions || sessions.length === 0) return '-'
  const latest = sessions.reduce((a, b) =>
    new Date(a.created_at) > new Date(b.created_at) ? a : b
  )
  return new Date(latest.created_at).toLocaleString()
}

export function PatientList({ patients }: PatientListProps) {
  return (
    <>
      {/* Table view - visible on md and above */}
      <div className="hidden md:block rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Date of Birth (Age)</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Last Session</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient) => (
              <TableRow key={patient.id}>
                <TableCell className="font-medium">{patient.full_name}</TableCell>
                <TableCell>
                  {patient.date_of_birth
                    ? `${formatDate(patient.date_of_birth)} (${calculateAge(patient.date_of_birth)})`
                    : '-'}
                </TableCell>
                <TableCell>{patient.gender || '-'}</TableCell>
                <TableCell>{patient.email || '-'}</TableCell>
                <TableCell>{getLastSession(patient.sessions)}</TableCell>
                <TableCell>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                  >
                    <Link href={`/practitioner/patients/${patient.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Card view - visible on sm and below */}
      <div className="md:hidden space-y-4">
        {patients.map((patient) => (
          <div key={patient.id} className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-600 font-medium">Name</p>
              <p className="font-medium text-gray-900">{patient.full_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Date of Birth (Age)</p>
              <p className="text-gray-900">
                {patient.date_of_birth
                  ? `${formatDate(patient.date_of_birth)} (${calculateAge(patient.date_of_birth)})`
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Gender</p>
              <p className="text-gray-900">{patient.gender || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Email</p>
              <p className="text-gray-900 break-all">{patient.email || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Last Session</p>
              <p className="text-gray-900">{getLastSession(patient.sessions)}</p>
            </div>
            <div className="pt-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Link href={`/practitioner/patients/${patient.id}`}>View</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
