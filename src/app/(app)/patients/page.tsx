import { createClient } from '@/lib/supabase/server'
import { PatientList } from '@/components/patients/patient-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { Suspense } from 'react'

interface PatientsPageProps {
  searchParams: Promise<{ search?: string }>
}

async function PatientsContent({ searchParams }: PatientsPageProps) {
  const params = await searchParams
  const search = params.search

  const supabase = await createClient()

  let query = supabase
    .from('patients')
    .select('*')
    .order('full_name', { ascending: true })

  if (search) {
    query = query.ilike('full_name', `%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600">Error loading patients: {error.message}</p>
      </div>
    )
  }

  const patients = data || []

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Patients</h1>
        <Button asChild>
          <Link href="/patients/new">New Patient</Link>
        </Button>
      </div>

      <form action="/patients" method="get" className="flex gap-2">
        <Input
          type="text"
          name="search"
          placeholder="Search by name..."
          defaultValue={search || ''}
          className="flex-1"
        />
        <Button type="submit">Search</Button>
      </form>

      {patients.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-gray-600">No patients found</p>
        </div>
      ) : (
        <PatientList patients={patients} />
      )}
    </div>
  )
}

export default async function PatientsPage(props: PatientsPageProps) {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <PatientsContent {...props} />
    </Suspense>
  )
}
