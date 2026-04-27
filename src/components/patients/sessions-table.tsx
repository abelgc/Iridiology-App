'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

interface Session {
  id: string
  session_date: string
  analysis_mode: string | null
  status: string
}

interface SessionsTableProps {
  sessions: Session[]
}

export function SessionsTable({ sessions }: SessionsTableProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session and its report? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        alert('Failed to delete session.')
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* Table view - visible on md and above */}
      <div className="hidden md:block rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>{session.session_date}</TableCell>
                <TableCell className="capitalize">
                  {session.analysis_mode?.replace(/_/g, ' ')}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      session.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : session.status === 'error'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {session.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/practitioner/sessions/${session.id}`}>View</Link>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deletingId === session.id}
                      onClick={() => handleDelete(session.id)}
                    >
                      {deletingId === session.id ? '...' : 'Delete'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Card view - visible on sm and below */}
      <div className="md:hidden space-y-4">
        {sessions.map((session) => (
          <div key={session.id} className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-600 font-medium">Date</p>
              <p className="text-gray-900">{session.session_date}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Mode</p>
              <p className="text-gray-900 capitalize">{session.analysis_mode?.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 font-medium">Status</p>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                  session.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : session.status === 'error'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {session.status}
              </span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link href={`/practitioner/sessions/${session.id}`}>View</Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={deletingId === session.id}
                onClick={() => handleDelete(session.id)}
              >
                {deletingId === session.id ? '...' : 'Delete'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
