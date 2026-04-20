'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLanguage } from '@/lib/i18n-context'
import {
  clientIntakeSchema,
  type ClientIntakeInput,
} from '@/lib/validators/client-intake'
import type { PaymentTier } from '@/types/client-analysis'

export function IntakeForm({
  tier,
  onSubmit,
}: {
  tier: PaymentTier
  onSubmit: (data: ClientIntakeInput) => void | Promise<void>
}) {
  const { lang, t } = useLanguage()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientIntakeInput>({
    resolver: zodResolver(clientIntakeSchema),
    defaultValues: { language: lang, payment_tier: tier, current_medications: '' },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input type="hidden" {...register('language')} value={lang} />
      <input type="hidden" {...register('payment_tier')} value={tier} />

      <Field label={t('fieldFullName')} error={errors.full_name && t('errorIntakeRequired')}>
        <input className="input" {...register('full_name')} />
      </Field>

      <Field label={t('fieldEmail')} error={errors.email && t('errorEmailFormat')}>
        <input type="email" className="input" {...register('email')} />
      </Field>

      <Field label={t('fieldMainComplaint')} error={errors.main_complaint && t('errorIntakeRequired')}>
        <textarea className="input" rows={3} {...register('main_complaint')} />
      </Field>

      <Field label={t('fieldSymptomDuration')} error={errors.symptom_duration && t('errorIntakeRequired')}>
        <input className="input" {...register('symptom_duration')} />
      </Field>

      <Field label={t('fieldCurrentMedications')}>
        <textarea className="input" rows={2} {...register('current_medications')} />
      </Field>

      <Field label={t('fieldDateOfBirth')} error={errors.date_of_birth && t('errorIntakeRequired')}>
        <input type="date" className="input" {...register('date_of_birth')} />
      </Field>

      <Field label={t('fieldCountryOfBirth')} error={errors.country_of_birth && t('errorIntakeRequired')}>
        <input className="input" {...register('country_of_birth')} />
      </Field>

      <Field label={t('fieldCityOfBirth')} error={errors.city_of_birth && t('errorIntakeRequired')}>
        <input className="input" {...register('city_of_birth')} />
      </Field>

      <fieldset>
        <legend className="block text-sm font-medium mb-2">{t('fieldTimeOfDay')}</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" value="morning" {...register('time_of_day')} />
            {t('timeOfDayMorning')}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="evening" {...register('time_of_day')} />
            {t('timeOfDayEvening')}
          </label>
        </div>
        {errors.time_of_day && (
          <p className="text-destructive text-sm mt-1">{t('errorIntakeRequired')}</p>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-[oklch(0.25_0.06_175)] text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {isSubmitting ? t('loading') : t('continue')}
      </button>
    </form>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
      {error && <p className="text-destructive text-sm mt-1">{error}</p>}
    </label>
  )
}
