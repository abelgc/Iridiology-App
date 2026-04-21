'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLanguage } from '@/lib/i18n-context'
import {
  clientIntakeSchema,
  type ClientIntakeInput,
} from '@/lib/validators/client-intake'
import type { PaymentTier } from '@/types/client-analysis'
import type { TranslationKey } from '@/lib/i18n'

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
    control,
    formState: { errors, isSubmitting },
  } = useForm<ClientIntakeInput>({
    resolver: zodResolver(clientIntakeSchema) as any,
    defaultValues: {
      language: lang,
      payment_tier: tier,
      current_medications: '',
      health_questionnaire: {},
    } as any,
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <input type="hidden" {...register('language')} value={lang} />
      <input type="hidden" {...register('payment_tier')} value={tier} />

      {/* Basic info */}
      <section className="space-y-4">
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
      </section>

      {/* Health questionnaire — 12 body systems */}
      <QuestionSection title={t('qSectionDigestive')}>
        {digestiveQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.digestive.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionCardiovascular')}>
        {cardiovascularQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.cardiovascular.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionRespiratory')}>
        {respiratoryQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.respiratory.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionNervous')}>
        {nervousQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.nervous.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionMusculoskeletal')}>
        {musculoskeletalQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.musculoskeletal.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionEndocrine')}>
        {endocrineQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.endocrine.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionUrinary')}>
        {urinaryQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.urinary.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionReproductive')}>
        {reproductiveQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.reproductive.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionSkinLymphatic')}>
        {skinLymphaticQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.skin_lymphatic.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionSensory')}>
        {sensoryQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.sensory.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionMentalEmotional')}>
        {mentalEmotionalQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.mental_emotional.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      <QuestionSection title={t('qSectionImmune')}>
        {immuneQuestions.map(({ key, field }) => (
          <BoolField key={field} label={t(key)} name={`health_questionnaire.immune.${field}` as any} control={control} />
        ))}
      </QuestionSection>

      {/* Free-text extra fields */}
      <QuestionSection title={t('qSectionExtra')}>
        <Field label={t('qExtraAllergies')}>
          <input className="input" {...register('health_questionnaire.known_allergies')} />
        </Field>
        <Field label={t('qExtraSurgeries')}>
          <textarea className="input" rows={2} {...register('health_questionnaire.past_surgeries')} />
        </Field>
        <Field label={t('qExtraFamilyHistory')}>
          <textarea className="input" rows={2} {...register('health_questionnaire.family_history')} />
        </Field>
      </QuestionSection>

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

function QuestionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-base font-semibold border-b pb-1 mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>
    </section>
  )
}

function BoolField({
  label,
  name,
  control,
}: {
  label: string
  name: any
  control: any
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!field.value}
            onChange={(e) => field.onChange(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">{label}</span>
        </label>
      )}
    />
  )
}

const digestiveQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qDigConstipation', field: 'constipation' },
  { key: 'qDigDiarrhea', field: 'diarrhea' },
  { key: 'qDigBloating', field: 'bloating' },
  { key: 'qDigNausea', field: 'nausea' },
  { key: 'qDigAcidReflux', field: 'acid_reflux' },
  { key: 'qDigStomachPain', field: 'stomach_pain' },
  { key: 'qDigHemorrhoids', field: 'hemorrhoids' },
  { key: 'qDigLiverGallbladder', field: 'liver_gallbladder_issues' },
  { key: 'qDigParasites', field: 'parasites' },
  { key: 'qDigBadBreath', field: 'bad_breath' },
]

const cardiovascularQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qCardPalpitations', field: 'palpitations' },
  { key: 'qCardChestPain', field: 'chest_pain' },
  { key: 'qCardHypertension', field: 'hypertension' },
  { key: 'qCardVaricoseVeins', field: 'varicose_veins' },
  { key: 'qCardPoorCirculation', field: 'poor_circulation' },
  { key: 'qCardAnemia', field: 'anemia' },
  { key: 'qCardBruising', field: 'frequent_bruising' },
]

const respiratoryQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qRespAsthma', field: 'asthma' },
  { key: 'qRespFrequentColds', field: 'frequent_colds' },
  { key: 'qRespChronicCough', field: 'chronic_cough' },
  { key: 'qRespShortnessBreath', field: 'shortness_of_breath' },
  { key: 'qRespSinusitis', field: 'sinusitis' },
  { key: 'qRespAllergies', field: 'seasonal_allergies' },
  { key: 'qRespBronchitis', field: 'bronchitis' },
]

const nervousQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qNervHeadaches', field: 'headaches' },
  { key: 'qNervMigraines', field: 'migraines' },
  { key: 'qNervInsomnia', field: 'insomnia' },
  { key: 'qNervAnxiety', field: 'anxiety' },
  { key: 'qNervDepression', field: 'depression' },
  { key: 'qNervMemory', field: 'memory_problems' },
  { key: 'qNervDizziness', field: 'dizziness' },
  { key: 'qNervNumbness', field: 'numbness_tingling' },
  { key: 'qNervTremors', field: 'tremors' },
  { key: 'qNervStress', field: 'chronic_stress' },
]

const musculoskeletalQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qMuscJointPain', field: 'joint_pain' },
  { key: 'qMuscBackPain', field: 'back_pain' },
  { key: 'qMuscArthritis', field: 'arthritis' },
  { key: 'qMuscCramps', field: 'muscle_cramps' },
  { key: 'qMuscOsteoporosis', field: 'osteoporosis' },
  { key: 'qMuscSciatica', field: 'sciatica' },
  { key: 'qMuscNeckPain', field: 'neck_pain' },
  { key: 'qMuscFibromyalgia', field: 'fibromyalgia' },
]

const endocrineQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qEndoThyroid', field: 'thyroid_problems' },
  { key: 'qEndoDiabetes', field: 'diabetes' },
  { key: 'qEndoWeightGain', field: 'weight_gain' },
  { key: 'qEndoWeightLoss', field: 'weight_loss' },
  { key: 'qEndoFatigue', field: 'excessive_fatigue' },
  { key: 'qEndoTempSensitivity', field: 'temperature_sensitivity' },
  { key: 'qEndoThirst', field: 'excessive_thirst' },
  { key: 'qEndoAdrenal', field: 'adrenal_issues' },
]

const urinaryQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qUrinKidneyStones', field: 'kidney_stones' },
  { key: 'qUrinFreqUrin', field: 'frequent_urination' },
  { key: 'qUrinInfections', field: 'urinary_infections' },
  { key: 'qUrinIncontinence', field: 'incontinence' },
  { key: 'qUrinDarkUrine', field: 'dark_urine' },
  { key: 'qUrinKidneyPain', field: 'kidney_pain' },
]

const reproductiveQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qReprodMenstrual', field: 'menstrual_irregularities' },
  { key: 'qReprodMenopause', field: 'menopause_symptoms' },
  { key: 'qReprodLibido', field: 'libido_changes' },
  { key: 'qReprodProstate', field: 'prostate_issues' },
  { key: 'qReprodFertility', field: 'fertility_issues' },
  { key: 'qReprodHormonal', field: 'hormonal_imbalance' },
]

const skinLymphaticQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qSkinAcne', field: 'acne' },
  { key: 'qSkinEczema', field: 'eczema' },
  { key: 'qSkinPsoriasis', field: 'psoriasis' },
  { key: 'qSkinInfections', field: 'frequent_infections' },
  { key: 'qSkinLymphNodes', field: 'swollen_lymph_nodes' },
  { key: 'qSkinSweating', field: 'excessive_sweating' },
  { key: 'qSkinDrySkin', field: 'dry_skin' },
  { key: 'qSkinHairLoss', field: 'hair_loss' },
  { key: 'qSkinNails', field: 'nail_problems' },
]

const sensoryQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qSensVision', field: 'vision_problems' },
  { key: 'qSensHearing', field: 'hearing_loss' },
  { key: 'qSensTinnitus', field: 'tinnitus' },
  { key: 'qSensNosebleed', field: 'frequent_nosebleeds' },
  { key: 'qSensTasteSmell', field: 'taste_smell_changes' },
  { key: 'qSensDryEyes', field: 'dry_eyes' },
  { key: 'qSensEarInfect', field: 'ear_infections' },
]

const mentalEmotionalQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qMentStress', field: 'chronic_stress' },
  { key: 'qMentMoodSwings', field: 'mood_swings' },
  { key: 'qMentPanic', field: 'panic_attacks' },
  { key: 'qMentObsessive', field: 'obsessive_thoughts' },
  { key: 'qMentEmotEating', field: 'emotional_eating' },
  { key: 'qMentWithdrawal', field: 'social_withdrawal' },
  { key: 'qMentBurnout', field: 'burnout' },
]

const immuneQuestions: { key: TranslationKey; field: string }[] = [
  { key: 'qImmuAutoimmune', field: 'autoimmune_disease' },
  { key: 'qImmuAllergies', field: 'frequent_allergies' },
  { key: 'qImmuCFS', field: 'chronic_fatigue_syndrome' },
  { key: 'qImmuFoodSens', field: 'food_sensitivities' },
  { key: 'qImmuChemSens', field: 'chemical_sensitivities' },
  { key: 'qImmuWoundHealing', field: 'slow_wound_healing' },
  { key: 'qImmuFever', field: 'frequent_fever' },
]
