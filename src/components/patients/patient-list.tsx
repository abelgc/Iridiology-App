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

interface PatientListProps {
  patients: Patient[]
}

export function PatientList({ patients }: PatientListProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Date of Birth (Age)</TableHead>
            <TableHead>Gender</TableHead>
            <TableHead>Email</TableHead>
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
              <TableCell>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                >
                  <Link href={`/patients/${patient.id}`}>View</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
