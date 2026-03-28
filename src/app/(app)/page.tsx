'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'

interface PatientCount {
  count: number
}

interface Session {
  id: string
  patient_id: string
  created_at: string
  patients?: any
}

export default function DashboardPage() {
  const [patientCount, setPatientCount] = useState<number>(0)
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createClient()

        // Fetch patient count
        const { count } = await supabase
          .from('patients')
          .select('*', { count: 'exact', head: true })

        setPatientCount(count || 0)

        // Fetch recent sessions
        const { data: sessions, error: sessionsError } = await supabase
          .from('sessions')
          .select('id, patient_id, created_at, patients(name)')
          .order('created_at', { ascending: false })
          .limit(5)

        if (sessionsError) {
          setError('Unable to load sessions')
        } else {
          setRecentSessions(sessions || [])
        }
      } catch (err) {
        setError('Unable to load dashboard data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="p-6">
          <p className="text-zinc-600 text-sm font-medium mb-2">Total Patients</p>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-3xl font-bold">{patientCount}</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-zinc-600 text-sm font-medium mb-2">Recent Sessions</p>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-3xl font-bold">{recentSessions.length}</p>
          )}
        </Card>
      </div>

      {/* Recent Sessions List */}
      <Card className="p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Recent Sessions</h2>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : recentSessions.length === 0 ? (
          <p className="text-zinc-600 text-sm">No sessions yet</p>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded">
                <div>
                  <p className="font-medium">
                    {session.patients?.name || 'Unknown Patient'}
                  </p>
                  <p className="text-sm text-zinc-600">
                    {new Date(session.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Quick Action */}
      <Link href="/sessions/new">
        <Button size="lg">Start New Analysis Session</Button>
      </Link>
    </div>
  )
}
