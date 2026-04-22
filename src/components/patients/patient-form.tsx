'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Patient } from '@/types/database'
import { patientCreateSchema, PatientCreateInput } from '@/lib/validators/patient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'

interface PatientFormProps {
  patient?: Patient
  onSubmit: (data: PatientCreateInput) => Promise<void>
  isLoading?: boolean
}

function parseTimeString(val: string | null | undefined): { hour: string; minute: string; period: 'AM' | 'PM' } {
  if (!val) return { hour: '', minute: '', period: 'AM' }
  const [h, m] = val.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return { hour: String(hour12), minute: String(m).padStart(2, '0'), period }
}

function composeTimeString(hour: string, minute: string, period: 'AM' | 'PM'): string | null {
  if (!hour || !minute) return null
  let h = parseInt(hour)
  if (period === 'AM') {
    if (h === 12) h = 0
  } else {
    if (h !== 12) h += 12
  }
  return `${String(h).padStart(2, '0')}:${minute}:00`
}

export function PatientForm({ patient, onSubmit, isLoading }: PatientFormProps) {
  const [submitting, setSubmitting] = useState(false)

  const initialTime = parseTimeString(patient?.time_of_day)
  const [timeHour, setTimeHour] = useState(initialTime.hour)
  const [timeMinute, setTimeMinute] = useState(initialTime.minute)
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>(initialTime.period)

  const form = useForm<PatientCreateInput>({
    resolver: zodResolver(patientCreateSchema),
    defaultValues: {
      full_name: patient?.full_name || '',
      date_of_birth: patient?.date_of_birth || '',
      country_of_birth: patient?.country_of_birth || '',
      city_of_birth: patient?.city_of_birth || '',
      time_of_day: patient?.time_of_day || null,
      gender: patient?.gender || '',
      email: patient?.email || '',
      phone: patient?.phone || '',
      general_history: patient?.general_history || '',
      notes: patient?.notes || '',
    },
  })

  useEffect(() => {
    form.setValue('time_of_day', composeTimeString(timeHour, timeMinute, timePeriod))
  }, [timeHour, timeMinute, timePeriod])

  const handleSubmit = async (data: PatientCreateInput) => {
    setSubmitting(true)
    try {
      await onSubmit(data)
    } finally {
      setSubmitting(false)
    }
  }

  const isSubmitting = submitting || isLoading

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="full_name"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Full Name *</FormLabel>
              <FormControl>
                <Input placeholder="Patient name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="date_of_birth"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Date of Birth</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="country_of_birth"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Country of Birth (optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., India" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="city_of_birth"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>City of Birth (optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Mumbai" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Time of Birth (optional)</FormLabel>
          <div className="flex gap-2">
            <Select value={timeHour} onValueChange={(v) => setTimeHour(v ?? '')}>
              <SelectTrigger className="w-20">
                <SelectValue placeholder="H" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeMinute} onValueChange={(v) => setTimeMinute(v ?? '')}>
              <SelectTrigger className="w-20">
                <SelectValue placeholder="MM" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timePeriod} onValueChange={(v) => setTimePeriod((v ?? 'AM') as 'AM' | 'PM')}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FormItem>

        <FormField
          control={form.control}
          name="gender"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Gender</FormLabel>
              <Select value={field.value || ''} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="patient@example.com" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input type="tel" placeholder="Phone number" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="general_history"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>General History</FormLabel>
              <FormControl>
                <Textarea placeholder="Patient medical history" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional notes" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : patient ? 'Update Patient' : 'Create Patient'}
        </Button>
      </form>
    </Form>
  )
}
