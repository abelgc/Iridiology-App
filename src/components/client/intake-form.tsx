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

  function onInvalid(invalidFields: Record<string, unknown>) {
    const firstErrorName = Object.keys(invalidFields)[0]
    if (!firstErrorName) return
    const el = document.querySelector(`[name="${firstErrorName}"]`)
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <input type="hidden" {...register('language')} value={lang} />
      <input type="hidden" {...register('payment_tier')} value={tier} />

      {/* Card 1: Personal details */}
      <IntakeCard
        icon={<IconUser />}
        title={t('intakeCardPersonalTitle')}
        sub={t('intakeCardPersonalSub')}
      >
        <div className="intake-grid intake-grid-2">
          <div className="intake-span-2">
            <IntakeField label={t('fieldFullName')} error={errors.full_name && t('errorIntakeRequired')}>
              <input className="intake-input" placeholder={t('phFullName')} {...register('full_name')} />
            </IntakeField>
          </div>
          <div className="intake-span-2">
            <IntakeField label={t('fieldEmail')} error={errors.email && t('errorEmailFormat')}>
              <input type="email" className="intake-input" placeholder={t('phEmail')} {...register('email')} />
            </IntakeField>
          </div>
          <div>
            <IntakeField label={t('fieldDateOfBirth')} error={errors.date_of_birth && t('errorIntakeRequired')}>
              <input type="date" className="intake-input" {...register('date_of_birth')} />
            </IntakeField>
          </div>
          <div>
            <IntakeField label={t('fieldCountryOfBirth')} error={errors.country_of_birth && t('errorIntakeRequired')}>
              <input className="intake-input" placeholder={t('phCountryOfBirth')} {...register('country_of_birth')} />
            </IntakeField>
          </div>
          <div className="intake-span-2">
            <IntakeField label={t('fieldCityOfBirth')} error={errors.city_of_birth && t('errorIntakeRequired')}>
              <input className="intake-input" placeholder={t('phCityOfBirth')} {...register('city_of_birth')} />
            </IntakeField>
          </div>
          <div className="intake-span-2">
            <fieldset style={{ border: 'none', padding: 0 }}>
              <legend className="intake-label" style={{ display: 'block', marginBottom: '4px' }}>{t('fieldTimeOfDay')}</legend>
              <div className="radio-row">
                <label className="radio-pill">
                  <input type="radio" value="morning" {...register('time_of_day')} />
                  <IconSun />
                  {t('timeOfDayMorning')}
                </label>
                <label className="radio-pill">
                  <input type="radio" value="evening" {...register('time_of_day')} />
                  <IconMoon />
                  {t('timeOfDayEvening')}
                </label>
              </div>
              {errors.time_of_day && (
                <p style={{ color: '#b54a3a', fontSize: '12px', marginTop: '4px' }}>{t('errorIntakeRequired')}</p>
              )}
            </fieldset>
          </div>
        </div>
      </IntakeCard>

      {/* Card 2: Wellness moment */}
      <IntakeCard
        icon={<IconHeart />}
        title={t('intakeCardWellnessTitle')}
        sub={t('intakeCardWellnessSub')}
      >
        <div className="intake-grid">
          <IntakeField label={t('fieldMainComplaint')} error={errors.main_complaint && t('errorIntakeRequired')}>
            <textarea className="intake-textarea" placeholder={t('phMainComplaint')} rows={3} {...register('main_complaint')} />
          </IntakeField>
          <IntakeField label={t('fieldSymptomDuration')} error={errors.symptom_duration && t('errorIntakeRequired')}>
            <input className="intake-input" placeholder={t('phSymptomDuration')} {...register('symptom_duration')} />
          </IntakeField>
          <IntakeField label={t('fieldCurrentMedications')} optional={t('intakeOptional')}>
            <textarea className="intake-textarea" placeholder={t('phCurrentMedications')} rows={2} style={{ minHeight: '80px' }} {...register('current_medications')} />
          </IntakeField>
        </div>
      </IntakeCard>

      {/* 12 body system cards */}
      <SystemCard icon={<IconDigestive />} title={t('qSectionDigestive')} sub={t('intakeCardSystemSub')}>
        {digestiveQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.digestive.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconHeart />} title={t('qSectionCardiovascular')} sub={t('intakeCardSystemSub')}>
        {cardiovascularQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.cardiovascular.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconWind />} title={t('qSectionRespiratory')} sub={t('intakeCardSystemSub')}>
        {respiratoryQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.respiratory.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconZap />} title={t('qSectionNervous')} sub={t('intakeCardSystemSub')}>
        {nervousQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.nervous.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconActivity />} title={t('qSectionMusculoskeletal')} sub={t('intakeCardSystemSub')}>
        {musculoskeletalQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.musculoskeletal.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconThermometer />} title={t('qSectionEndocrine')} sub={t('intakeCardSystemSub')}>
        {endocrineQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.endocrine.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconDroplet />} title={t('qSectionUrinary')} sub={t('intakeCardSystemSub')}>
        {urinaryQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.urinary.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconSun />} title={t('qSectionReproductive')} sub={t('intakeCardSystemSub')}>
        {reproductiveQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.reproductive.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconShield />} title={t('qSectionSkinLymphatic')} sub={t('intakeCardSystemSub')}>
        {skinLymphaticQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.skin_lymphatic.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconEye />} title={t('qSectionSensory')} sub={t('intakeCardSystemSub')}>
        {sensoryQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.sensory.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconBrain />} title={t('qSectionMentalEmotional')} sub={t('intakeCardSystemSub')}>
        {mentalEmotionalQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.mental_emotional.${field}` as any} control={control} />
        ))}
      </SystemCard>

      <SystemCard icon={<IconShieldCheck />} title={t('qSectionImmune')} sub={t('intakeCardSystemSub')}>
        {immuneQuestions.map(({ key, field }) => (
          <CheckTile key={field} label={t(key)} name={`health_questionnaire.immune.${field}` as any} control={control} />
        ))}
      </SystemCard>

      {/* Card: Extra context */}
      <IntakeCard icon={<IconFile />} title={t('intakeCardExtraTitle')}>
        <div className="intake-grid">
          <IntakeField label={t('qExtraAllergies')}>
            <input className="intake-input" placeholder={t('phKnownAllergies')} {...register('health_questionnaire.known_allergies')} />
          </IntakeField>
          <IntakeField label={t('qExtraSurgeries')}>
            <textarea className="intake-textarea" rows={2} placeholder={t('phPastSurgeries')} {...register('health_questionnaire.past_surgeries')} />
          </IntakeField>
          <IntakeField label={t('qExtraFamilyHistory')}>
            <textarea className="intake-textarea" rows={2} placeholder={t('phFamilyHistory')} {...register('health_questionnaire.family_history')} />
          </IntakeField>
        </div>
      </IntakeCard>

      {/* Submit bar */}
      <div className="submit-bar">
        <div className="secure-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {t('intakeSecureNote')}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="cta-premium"
          style={{ width: 'auto', minWidth: '200px' }}
        >
          {isSubmitting ? t('loading') : t('intakeContinueToPayment')}
          {!isSubmitting && (
            <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
              <path d="M3 8H13M13 8L8 3M13 8L8 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </form>
  )
}

/* ===== Helper components ===== */

function IntakeCard({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="intake-card">
      <div className="intake-card-head">
        <span className="intake-card-dot">{icon}</span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '19px', color: '#2a3520', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          {title}
        </h3>
      </div>
      {sub && <p className="intake-card-sub">{sub}</p>}
      <div className="intake-card-body">{children}</div>
    </div>
  )
}

function SystemCard({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="intake-card">
      <div className="intake-card-head">
        <span className="intake-card-dot system">{icon}</span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '19px', color: '#2a3520', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          {title}
        </h3>
      </div>
      <p className="intake-card-sub">{sub}</p>
      <div className="intake-card-body">
        <div className="check-grid">{children}</div>
      </div>
    </div>
  )
}

function IntakeField({
  label,
  optional,
  error,
  children,
}: {
  label: string
  optional?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="intake-field">
      <span className="intake-label">
        {label}
        {optional && <span className="intake-label-opt">({optional})</span>}
      </span>
      {children}
      {error && <p style={{ color: '#b54a3a', fontSize: '12px', marginTop: '2px' }}>{error}</p>}
    </label>
  )
}

function CheckTile({
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
        <label className="check-tile">
          <input
            type="checkbox"
            checked={!!field.value}
            onChange={(e) => field.onChange(e.target.checked)}
          />
          {label}
        </label>
      )}
    />
  )
}

/* ===== SVG icon components (18×18, stroke-based) ===== */

const SvgWrap = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    {children}
  </svg>
)

const IconUser = () => <SvgWrap><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></SvgWrap>
const IconHeart = () => <SvgWrap><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></SvgWrap>
const IconDigestive = () => <SvgWrap><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></SvgWrap>
const IconWind = () => <SvgWrap><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></SvgWrap>
const IconZap = () => <SvgWrap><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></SvgWrap>
const IconActivity = () => <SvgWrap><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></SvgWrap>
const IconThermometer = () => <SvgWrap><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></SvgWrap>
const IconDroplet = () => <SvgWrap><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></SvgWrap>
const IconSun = () => <SvgWrap><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></SvgWrap>
const IconMoon = () => <SvgWrap><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></SvgWrap>
const IconShield = () => <SvgWrap><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></SvgWrap>
const IconEye = () => <SvgWrap><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></SvgWrap>
const IconBrain = () => <SvgWrap><path d="M9.5 2A6.5 6.5 0 0 0 3 8.5c0 1.7.65 3.25 1.7 4.4l.3.3V20a2 2 0 0 0 2 2h2v-3h2v3h4v-7.8l.3-.3A6.5 6.5 0 0 0 16 2H9.5z"/></SvgWrap>
const IconShieldCheck = () => <SvgWrap><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></SvgWrap>
const IconFile = () => <SvgWrap><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></SvgWrap>

/* ===== Question arrays (unchanged from original) ===== */

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
