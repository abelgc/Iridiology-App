# Health Questionnaire Intake & Payment Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Allow the mock-payment route to work in production via an env-var flag so the full client flow can be manually tested, and (2) Replace the 9-field intake form with the comprehensive "Cuestionario de Salud" health questionnaire (12 body-system sections, ~100 yes/no questions, plus free-text fields for medications/allergies/surgeries/family history), storing the answers as JSONB and passing them to Claude.

**Architecture:** The health questionnaire is stored as a single `health_questionnaire JSONB` column on `client_analyses` (avoids 100+ DB columns). The Zod schema is split into a dedicated `health-questionnaire.ts` validator file and merged into the intake schema. The Claude prompt receives a `PATIENT CLINICAL HISTORY` block (positive answers only, grouped by body system) labelled explicitly as clinical evidence. The system prompt (`prompts.ts`) is extended with a `CLINICAL HISTORY INTEGRATION` rule instructing Claude to: confirm iris findings that match reported symptoms with explicit causal reasoning; flag iris findings with no reported symptom as preclinical signs; never invent symptoms beyond what the history provides.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, react-hook-form + zodResolver, Supabase (service-role admin client), Vitest for unit tests.

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/app/api/client/payment/route.ts` |
| Create | `docs/migrations/004-health-questionnaire.sql` |
| Create | `src/lib/validators/health-questionnaire.ts` |
| Modify | `src/lib/validators/client-intake.ts` |
| Modify | `src/lib/i18n.ts` |
| Modify | `src/components/client/intake-form.tsx` |
| Modify | `src/app/api/client/intake/route.ts` |
| Modify | `src/lib/claude/prompts.ts` |
| Modify | `src/lib/claude/analyze.ts` |
| Modify | `src/app/api/client/upload/route.ts` |
| Create | `src/lib/validators/__tests__/health-questionnaire.test.ts` |
| Create | `src/lib/claude/__tests__/analyze-prompt.test.ts` |

---

### Task 1: Payment bypass — env-var flag

**Files:**
- Modify: `src/app/api/client/payment/route.ts`
- Modify: `.env.local` (add key; do NOT commit)

**Context:** The route currently returns 403 in production (`NODE_ENV === 'production'`). Replace with an explicit opt-in env var `ENABLE_MOCK_PAYMENT=true` so the owner can enable it on Vercel without a code change.

- [ ] **Step 1: Edit payment route**

Replace the guard at the top of `src/app/api/client/payment/route.ts`:

```typescript
// OLD (remove this):
if (process.env.NODE_ENV === 'production') {
  return NextResponse.json({ error: 'mock_payment_disabled_in_production' }, { status: 403 })
}

// NEW (replace with):
if (!process.env.ENABLE_MOCK_PAYMENT) {
  return NextResponse.json({ error: 'mock_payment_disabled' }, { status: 403 })
}
```

- [ ] **Step 2: Add the flag to `.env.local`**

Open `.env.local` and add:
```
ENABLE_MOCK_PAYMENT=true
```

- [ ] **Step 3: Verify `.env.local` is in `.gitignore`**

Run:
```bash
grep -n "env.local" .gitignore
```
Expected output contains `.env.local`. If it does not, add `.env.local` to `.gitignore`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/client/payment/route.ts
git commit -m "fix(payment): replace NODE_ENV guard with ENABLE_MOCK_PAYMENT env var"
```

---

### Task 2: DB migration — add health_questionnaire column

**Files:**
- Create: `docs/migrations/004-health-questionnaire.sql`

- [ ] **Step 1: Write migration file**

Create `docs/migrations/004-health-questionnaire.sql`:

```sql
-- Migration 004: add health_questionnaire JSONB to client_analyses
-- Date: 2026-04-20

ALTER TABLE client_analyses
  ADD COLUMN IF NOT EXISTS health_questionnaire JSONB;
```

- [ ] **Step 2: Apply the migration in Supabase**

In the Supabase Dashboard → SQL Editor, paste and run the migration. Verify the column appears in Table Editor → `client_analyses`.

- [ ] **Step 3: Commit**

```bash
git add docs/migrations/004-health-questionnaire.sql
git commit -m "feat(db): add health_questionnaire JSONB column to client_analyses"
```

---

### Task 3: Health questionnaire Zod schema

**Files:**
- Create: `src/lib/validators/health-questionnaire.ts`
- Create: `src/lib/validators/__tests__/health-questionnaire.test.ts`

The schema represents 12 body-system sections as objects of `z.boolean()` fields, plus four free-text fields. All boolean fields are optional and default to `false` so the form can be partially filled.

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/validators/__tests__/health-questionnaire.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { healthQuestionnaireSchema } from '../health-questionnaire'

describe('healthQuestionnaireSchema', () => {
  it('accepts an empty object and defaults all booleans to false', () => {
    const result = healthQuestionnaireSchema.safeParse({})
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.digestive.constipation).toBe(false)
    expect(result.data.nervous.insomnia).toBe(false)
  })

  it('accepts true for any boolean field', () => {
    const result = healthQuestionnaireSchema.safeParse({
      digestive: { bloating: true, constipation: true },
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.digestive.bloating).toBe(true)
    expect(result.data.digestive.constipation).toBe(true)
    expect(result.data.digestive.diarrhea).toBe(false) // defaulted
  })

  it('accepts optional free-text fields', () => {
    const result = healthQuestionnaireSchema.safeParse({
      medications_supplements: 'Metformin 500mg',
      known_allergies: 'Penicillin',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.medications_supplements).toBe('Metformin 500mg')
  })

  it('rejects non-boolean values for symptom fields', () => {
    const result = healthQuestionnaireSchema.safeParse({
      digestive: { constipation: 'yes' },
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/validators/__tests__/health-questionnaire.test.ts
```
Expected: FAIL — `Cannot find module '../health-questionnaire'`

- [ ] **Step 3: Create the schema**

Create `src/lib/validators/health-questionnaire.ts`:

```typescript
import { z } from 'zod'

const boolField = z.boolean().optional().default(false)

export const healthQuestionnaireSchema = z.object({
  digestive: z.object({
    constipation: boolField,
    diarrhea: boolField,
    bloating: boolField,
    nausea: boolField,
    acid_reflux: boolField,
    stomach_pain: boolField,
    hemorrhoids: boolField,
    liver_gallbladder_issues: boolField,
    parasites: boolField,
    bad_breath: boolField,
  }).optional().default({}),

  cardiovascular: z.object({
    palpitations: boolField,
    chest_pain: boolField,
    hypertension: boolField,
    varicose_veins: boolField,
    poor_circulation: boolField,
    anemia: boolField,
    frequent_bruising: boolField,
  }).optional().default({}),

  respiratory: z.object({
    asthma: boolField,
    frequent_colds: boolField,
    chronic_cough: boolField,
    shortness_of_breath: boolField,
    sinusitis: boolField,
    seasonal_allergies: boolField,
    bronchitis: boolField,
  }).optional().default({}),

  nervous: z.object({
    headaches: boolField,
    migraines: boolField,
    insomnia: boolField,
    anxiety: boolField,
    depression: boolField,
    memory_problems: boolField,
    dizziness: boolField,
    numbness_tingling: boolField,
    tremors: boolField,
    chronic_stress: boolField,
  }).optional().default({}),

  musculoskeletal: z.object({
    joint_pain: boolField,
    back_pain: boolField,
    arthritis: boolField,
    muscle_cramps: boolField,
    osteoporosis: boolField,
    sciatica: boolField,
    neck_pain: boolField,
    fibromyalgia: boolField,
  }).optional().default({}),

  endocrine: z.object({
    thyroid_problems: boolField,
    diabetes: boolField,
    weight_gain: boolField,
    weight_loss: boolField,
    excessive_fatigue: boolField,
    temperature_sensitivity: boolField,
    excessive_thirst: boolField,
    adrenal_issues: boolField,
  }).optional().default({}),

  urinary: z.object({
    kidney_stones: boolField,
    frequent_urination: boolField,
    urinary_infections: boolField,
    incontinence: boolField,
    dark_urine: boolField,
    kidney_pain: boolField,
  }).optional().default({}),

  reproductive: z.object({
    menstrual_irregularities: boolField,
    menopause_symptoms: boolField,
    libido_changes: boolField,
    prostate_issues: boolField,
    fertility_issues: boolField,
    hormonal_imbalance: boolField,
  }).optional().default({}),

  skin_lymphatic: z.object({
    acne: boolField,
    eczema: boolField,
    psoriasis: boolField,
    frequent_infections: boolField,
    swollen_lymph_nodes: boolField,
    excessive_sweating: boolField,
    dry_skin: boolField,
    hair_loss: boolField,
    nail_problems: boolField,
  }).optional().default({}),

  sensory: z.object({
    vision_problems: boolField,
    hearing_loss: boolField,
    tinnitus: boolField,
    frequent_nosebleeds: boolField,
    taste_smell_changes: boolField,
    dry_eyes: boolField,
    ear_infections: boolField,
  }).optional().default({}),

  mental_emotional: z.object({
    chronic_stress: boolField,
    mood_swings: boolField,
    panic_attacks: boolField,
    obsessive_thoughts: boolField,
    emotional_eating: boolField,
    social_withdrawal: boolField,
    burnout: boolField,
  }).optional().default({}),

  immune: z.object({
    autoimmune_disease: boolField,
    frequent_allergies: boolField,
    chronic_fatigue_syndrome: boolField,
    food_sensitivities: boolField,
    chemical_sensitivities: boolField,
    slow_wound_healing: boolField,
    frequent_fever: boolField,
  }).optional().default({}),

  // Free-text fields
  medications_supplements: z.string().max(2000).optional(),
  known_allergies: z.string().max(1000).optional(),
  past_surgeries: z.string().max(1000).optional(),
  family_history: z.string().max(2000).optional(),
})

export type HealthQuestionnaire = z.infer<typeof healthQuestionnaireSchema>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/validators/__tests__/health-questionnaire.test.ts
```
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/health-questionnaire.ts src/lib/validators/__tests__/health-questionnaire.test.ts
git commit -m "feat(validators): add health questionnaire Zod schema with 12 body systems"
```

---

### Task 4: Merge questionnaire schema into intake validator

**Files:**
- Modify: `src/lib/validators/client-intake.ts`

- [ ] **Step 1: Update the intake schema**

Replace the entire contents of `src/lib/validators/client-intake.ts`:

```typescript
import { z } from 'zod'
import { healthQuestionnaireSchema } from './health-questionnaire'

export const clientIntakeSchema = z.object({
  language: z.enum(['en', 'es']),
  payment_tier: z.enum(['basic_12', 'premium_19_90']),
  full_name: z.string().min(1).max(255),
  email: z.string().email(),
  main_complaint: z.string().min(1).max(2000),
  symptom_duration: z.string().min(1).max(255),
  current_medications: z.string().max(2000).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  country_of_birth: z.string().min(1).max(255),
  city_of_birth: z.string().min(1).max(255),
  time_of_day: z.enum(['morning', 'evening']),
  health_questionnaire: healthQuestionnaireSchema.optional().default({}),
})

export type ClientIntakeInput = z.infer<typeof clientIntakeSchema>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to `client-intake.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators/client-intake.ts
git commit -m "feat(validators): add health_questionnaire field to intake schema"
```

---

### Task 5: Add i18n keys for questionnaire labels

**Files:**
- Modify: `src/lib/i18n.ts`

Add the following keys to **both** `en` and `es` objects. Insert them inside `translations.en` and `translations.es` respectively.

- [ ] **Step 1: Add English keys**

In `src/lib/i18n.ts`, inside `translations.en`, add after the existing keys (before the closing `}`):

```typescript
    // Questionnaire section headers
    qSectionDigestive: 'Digestive System',
    qSectionCardiovascular: 'Cardiovascular System',
    qSectionRespiratory: 'Respiratory System',
    qSectionNervous: 'Nervous System',
    qSectionMusculoskeletal: 'Musculoskeletal System',
    qSectionEndocrine: 'Endocrine System',
    qSectionUrinary: 'Urinary System',
    qSectionReproductive: 'Reproductive System',
    qSectionSkinLymphatic: 'Skin & Lymphatic System',
    qSectionSensory: 'Sensory Organs',
    qSectionMentalEmotional: 'Mental & Emotional',
    qSectionImmune: 'Immune System',
    qSectionExtra: 'Additional Information',
    // Questionnaire field labels (digestive)
    qDigConstipation: 'Constipation',
    qDigDiarrhea: 'Diarrhea',
    qDigBloating: 'Abdominal bloating or gas',
    qDigNausea: 'Nausea or vomiting',
    qDigAcidReflux: 'Acid reflux / heartburn',
    qDigStomachPain: 'Stomach or abdominal pain',
    qDigHemorrhoids: 'Hemorrhoids',
    qDigLiverGallbladder: 'Liver or gallbladder issues',
    qDigParasites: 'History of parasites',
    qDigBadBreath: 'Persistent bad breath',
    // Cardiovascular
    qCardPalpitations: 'Heart palpitations',
    qCardChestPain: 'Chest pain or tightness',
    qCardHypertension: 'High blood pressure',
    qCardVaricoseVeins: 'Varicose veins',
    qCardPoorCirculation: 'Poor circulation (cold hands/feet)',
    qCardAnemia: 'Anemia',
    qCardBruising: 'Bruise easily',
    // Respiratory
    qRespAsthma: 'Asthma',
    qRespFrequentColds: 'Frequent colds or flu',
    qRespChronicCough: 'Chronic cough',
    qRespShortnessBreath: 'Shortness of breath',
    qRespSinusitis: 'Sinusitis',
    qRespAllergies: 'Seasonal allergies',
    qRespBronchitis: 'Bronchitis',
    // Nervous
    qNervHeadaches: 'Frequent headaches',
    qNervMigraines: 'Migraines',
    qNervInsomnia: 'Insomnia or poor sleep',
    qNervAnxiety: 'Anxiety',
    qNervDepression: 'Depression',
    qNervMemory: 'Memory or concentration problems',
    qNervDizziness: 'Dizziness or vertigo',
    qNervNumbness: 'Numbness or tingling',
    qNervTremors: 'Tremors',
    qNervStress: 'Chronic stress',
    // Musculoskeletal
    qMuscJointPain: 'Joint pain',
    qMuscBackPain: 'Back pain',
    qMuscArthritis: 'Arthritis',
    qMuscCramps: 'Muscle cramps',
    qMuscOsteoporosis: 'Osteoporosis',
    qMuscSciatica: 'Sciatica',
    qMuscNeckPain: 'Neck pain',
    qMuscFibromyalgia: 'Fibromyalgia',
    // Endocrine
    qEndoThyroid: 'Thyroid problems',
    qEndoDiabetes: 'Diabetes or pre-diabetes',
    qEndoWeightGain: 'Unexplained weight gain',
    qEndoWeightLoss: 'Unexplained weight loss',
    qEndoFatigue: 'Excessive fatigue',
    qEndoTempSensitivity: 'Sensitivity to temperature changes',
    qEndoThirst: 'Excessive thirst',
    qEndoAdrenal: 'Adrenal insufficiency',
    // Urinary
    qUrinKidneyStones: 'Kidney stones',
    qUrinFreqUrin: 'Frequent urination',
    qUrinInfections: 'Urinary tract infections',
    qUrinIncontinence: 'Incontinence',
    qUrinDarkUrine: 'Dark or cloudy urine',
    qUrinKidneyPain: 'Kidney or flank pain',
    // Reproductive
    qReprodMenstrual: 'Irregular menstrual cycle',
    qReprodMenopause: 'Menopause symptoms',
    qReprodLibido: 'Changes in libido',
    qReprodProstate: 'Prostate issues',
    qReprodFertility: 'Fertility issues',
    qReprodHormonal: 'Hormonal imbalance',
    // Skin & Lymphatic
    qSkinAcne: 'Acne',
    qSkinEczema: 'Eczema or dermatitis',
    qSkinPsoriasis: 'Psoriasis',
    qSkinInfections: 'Frequent skin infections',
    qSkinLymphNodes: 'Swollen lymph nodes',
    qSkinSweating: 'Excessive sweating',
    qSkinDrySkin: 'Dry or itchy skin',
    qSkinHairLoss: 'Hair loss',
    qSkinNails: 'Brittle or deformed nails',
    // Sensory
    qSensVision: 'Vision problems',
    qSensHearing: 'Hearing loss',
    qSensTinnitus: 'Tinnitus (ringing in ears)',
    qSensNosebleed: 'Frequent nosebleeds',
    qSensTasteSmell: 'Changes in taste or smell',
    qSensDryEyes: 'Dry eyes',
    qSensEarInfect: 'Ear infections',
    // Mental & Emotional
    qMentStress: 'Chronic stress',
    qMentMoodSwings: 'Mood swings',
    qMentPanic: 'Panic attacks',
    qMentObsessive: 'Obsessive or intrusive thoughts',
    qMentEmotEating: 'Emotional eating',
    qMentWithdrawal: 'Social withdrawal',
    qMentBurnout: 'Burnout or exhaustion',
    // Immune
    qImmuAutoimmune: 'Autoimmune disease',
    qImmuAllergies: 'Frequent allergies',
    qImmuCFS: 'Chronic fatigue syndrome',
    qImmuFoodSens: 'Food sensitivities or intolerances',
    qImmuChemSens: 'Chemical or environmental sensitivities',
    qImmuWoundHealing: 'Slow wound healing',
    qImmuFever: 'Frequent or recurring fever',
    // Extra free-text labels
    qExtraMedications: 'Current medications and supplements',
    qExtraAllergies: 'Known allergies',
    qExtraSurgeries: 'Past surgeries or hospitalizations',
    qExtraFamilyHistory: 'Relevant family health history',
```

- [ ] **Step 2: Add Spanish keys**

In `src/lib/i18n.ts`, inside `translations.es`, add the same keys with Spanish values:

```typescript
    // Secciones del cuestionario
    qSectionDigestive: 'Sistema Digestivo',
    qSectionCardiovascular: 'Sistema Cardiovascular',
    qSectionRespiratory: 'Sistema Respiratorio',
    qSectionNervous: 'Sistema Nervioso',
    qSectionMusculoskeletal: 'Sistema Musculoesquelético',
    qSectionEndocrine: 'Sistema Endocrino',
    qSectionUrinary: 'Sistema Urinario',
    qSectionReproductive: 'Sistema Reproductivo',
    qSectionSkinLymphatic: 'Piel y Sistema Linfático',
    qSectionSensory: 'Órganos Sensoriales',
    qSectionMentalEmotional: 'Mental y Emocional',
    qSectionImmune: 'Sistema Inmunológico',
    qSectionExtra: 'Información Adicional',
    // Digestivo
    qDigConstipation: 'Estreñimiento',
    qDigDiarrhea: 'Diarrea',
    qDigBloating: 'Distensión abdominal o gases',
    qDigNausea: 'Náuseas o vómitos',
    qDigAcidReflux: 'Reflujo ácido / acidez',
    qDigStomachPain: 'Dolor de estómago o abdominal',
    qDigHemorrhoids: 'Hemorroides',
    qDigLiverGallbladder: 'Problemas de hígado o vesícula',
    qDigParasites: 'Historial de parásitos',
    qDigBadBreath: 'Mal aliento persistente',
    // Cardiovascular
    qCardPalpitations: 'Palpitaciones cardíacas',
    qCardChestPain: 'Dolor o presión en el pecho',
    qCardHypertension: 'Presión arterial alta',
    qCardVaricoseVeins: 'Várices',
    qCardPoorCirculation: 'Mala circulación (manos/pies fríos)',
    qCardAnemia: 'Anemia',
    qCardBruising: 'Hematomas con facilidad',
    // Respiratorio
    qRespAsthma: 'Asma',
    qRespFrequentColds: 'Resfriados o gripes frecuentes',
    qRespChronicCough: 'Tos crónica',
    qRespShortnessBreath: 'Dificultad para respirar',
    qRespSinusitis: 'Sinusitis',
    qRespAllergies: 'Alergias estacionales',
    qRespBronchitis: 'Bronquitis',
    // Nervioso
    qNervHeadaches: 'Dolores de cabeza frecuentes',
    qNervMigraines: 'Migrañas',
    qNervInsomnia: 'Insomnio o mal sueño',
    qNervAnxiety: 'Ansiedad',
    qNervDepression: 'Depresión',
    qNervMemory: 'Problemas de memoria o concentración',
    qNervDizziness: 'Mareos o vértigo',
    qNervNumbness: 'Entumecimiento u hormigueo',
    qNervTremors: 'Temblores',
    qNervStress: 'Estrés crónico',
    // Musculoesquelético
    qMuscJointPain: 'Dolor articular',
    qMuscBackPain: 'Dolor de espalda',
    qMuscArthritis: 'Artritis',
    qMuscCramps: 'Calambres musculares',
    qMuscOsteoporosis: 'Osteoporosis',
    qMuscSciatica: 'Ciática',
    qMuscNeckPain: 'Dolor de cuello',
    qMuscFibromyalgia: 'Fibromialgia',
    // Endocrino
    qEndoThyroid: 'Problemas de tiroides',
    qEndoDiabetes: 'Diabetes o prediabetes',
    qEndoWeightGain: 'Aumento de peso inexplicable',
    qEndoWeightLoss: 'Pérdida de peso inexplicable',
    qEndoFatigue: 'Fatiga excesiva',
    qEndoTempSensitivity: 'Sensibilidad a cambios de temperatura',
    qEndoThirst: 'Sed excesiva',
    qEndoAdrenal: 'Insuficiencia suprarrenal',
    // Urinario
    qUrinKidneyStones: 'Cálculos renales',
    qUrinFreqUrin: 'Micción frecuente',
    qUrinInfections: 'Infecciones urinarias',
    qUrinIncontinence: 'Incontinencia',
    qUrinDarkUrine: 'Orina oscura o turbia',
    qUrinKidneyPain: 'Dolor renal o lumbar',
    // Reproductivo
    qReprodMenstrual: 'Ciclo menstrual irregular',
    qReprodMenopause: 'Síntomas de menopausia',
    qReprodLibido: 'Cambios en la libido',
    qReprodProstate: 'Problemas de próstata',
    qReprodFertility: 'Problemas de fertilidad',
    qReprodHormonal: 'Desequilibrio hormonal',
    // Piel y Linfático
    qSkinAcne: 'Acné',
    qSkinEczema: 'Eccema o dermatitis',
    qSkinPsoriasis: 'Psoriasis',
    qSkinInfections: 'Infecciones cutáneas frecuentes',
    qSkinLymphNodes: 'Ganglios linfáticos inflamados',
    qSkinSweating: 'Sudoración excesiva',
    qSkinDrySkin: 'Piel seca o con picazón',
    qSkinHairLoss: 'Caída del cabello',
    qSkinNails: 'Uñas frágiles o deformadas',
    // Sensorial
    qSensVision: 'Problemas de visión',
    qSensHearing: 'Pérdida auditiva',
    qSensTinnitus: 'Tinnitus (zumbido en los oídos)',
    qSensNosebleed: 'Sangrado de nariz frecuente',
    qSensTasteSmell: 'Cambios en gusto u olfato',
    qSensDryEyes: 'Ojos secos',
    qSensEarInfect: 'Infecciones de oído',
    // Mental y Emocional
    qMentStress: 'Estrés crónico',
    qMentMoodSwings: 'Cambios de humor',
    qMentPanic: 'Ataques de pánico',
    qMentObsessive: 'Pensamientos obsesivos o intrusivos',
    qMentEmotEating: 'Comer emocional',
    qMentWithdrawal: 'Aislamiento social',
    qMentBurnout: 'Agotamiento o burnout',
    // Inmunológico
    qImmuAutoimmune: 'Enfermedad autoinmune',
    qImmuAllergies: 'Alergias frecuentes',
    qImmuCFS: 'Síndrome de fatiga crónica',
    qImmuFoodSens: 'Sensibilidades o intolerancias alimentarias',
    qImmuChemSens: 'Sensibilidades químicas o ambientales',
    qImmuWoundHealing: 'Cicatrización lenta',
    qImmuFever: 'Fiebre frecuente o recurrente',
    // Información extra
    qExtraMedications: 'Medicamentos y suplementos actuales',
    qExtraAllergies: 'Alergias conocidas',
    qExtraSurgeries: 'Cirugías u hospitalizaciones previas',
    qExtraFamilyHistory: 'Historial de salud familiar relevante',
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to `i18n.ts` or `TranslationKey`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat(i18n): add EN/ES labels for all health questionnaire fields"
```

---

### Task 6: Rewrite intake form with questionnaire sections

**Files:**
- Modify: `src/components/client/intake-form.tsx`

The form renders in sections. Basic patient info stays at the top. Below it, 12 collapsible/direct sections render the yes/no checkboxes. The four free-text fields (medications, allergies, surgeries, family history) appear at the bottom.

- [ ] **Step 1: Rewrite `intake-form.tsx`**

Replace the entire file with:

```tsx
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
    resolver: zodResolver(clientIntakeSchema),
    defaultValues: {
      language: lang,
      payment_tier: tier,
      current_medications: '',
      health_questionnaire: {},
    },
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
        <Field label={t('qExtraMedications')}>
          <textarea className="input" rows={2} {...register('health_questionnaire.medications_supplements')} />
        </Field>
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

// ── Sub-components ────────────────────────────────────────────────────────────

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

// ── Question metadata ─────────────────────────────────────────────────────────

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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/client/intake-form.tsx
git commit -m "feat(form): rewrite intake form with 12-section health questionnaire"
```

---

### Task 7: Store health_questionnaire in intake API

**Files:**
- Modify: `src/app/api/client/intake/route.ts`

- [ ] **Step 1: Add health_questionnaire to the DB insert**

In `src/app/api/client/intake/route.ts`, inside the `.insert({...})` block, add one field after `time_of_day`:

```typescript
      time_of_day: data.time_of_day,
      health_questionnaire: data.health_questionnaire ?? null,  // ← add this line
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/client/intake/route.ts
git commit -m "feat(api): store health_questionnaire JSONB in client intake"
```

---

### Task 8: Add clinical history integration to the system prompt

**Files:**
- Modify: `src/lib/claude/prompts.ts`

The system prompt is where Claude learns the rules of the analysis. We add a `CLINICAL HISTORY INTEGRATION` block that tells Claude to actively cross-reference iris findings with the patient's reported symptoms — confirming matches with causal reasoning and flagging unmatched findings as preclinical signs.

This block must be added to **both** `STANDARD_ANALYSIS_SYSTEM_PROMPT` (ES, used when `lang === 'es'`) and `STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` (EN). It belongs after `INTERPRETATION RULES` and before `DETECTED AXES FORMAT`, so it applies during the main analysis reasoning phase.

- [ ] **Step 1: Add the block to the Spanish prompt (`STANDARD_ANALYSIS_SYSTEM_PROMPT`)**

In `src/lib/claude/prompts.ts`, find the end of the `INTERPRETATION RULES` section in `STANDARD_ANALYSIS_SYSTEM_PROMPT` (around line 19). Insert this block between `INTERPRETATION RULES` and `DETECTED AXES FORMAT`:

```
CLINICAL HISTORY INTEGRATION:
The user message contains a PATIENT CLINICAL HISTORY section listing self-reported symptoms grouped by body system. Use this as corroborating clinical evidence — not as a replacement for iris observation.

Apply these rules for every body system you analyse:

1. CONFIRMATION: If an iris finding corresponds to a body system where the patient has reported symptoms, state the correlation explicitly. Name the iris sign, name the reported symptom, and explain the physiological mechanism that connects them. Example: "Low pancreatic enzymatic activity suggested by the iris pattern in the pancreatic zone is consistent with the patient's reported bloating and digestive gas, as reduced enzyme output leads to incomplete macronutrient breakdown and fermentation in the intestinal tract."

2. PRECLINICAL SIGN: If an iris finding has no corresponding reported symptom in the same body system, identify it as a subclinical or preclinical pattern. Example: "Although the patient reports no urinary symptoms, the iris reveals congestion in the renal zone, suggesting a functional burden that has not yet produced subjective symptoms."

3. RESTRAINT: Do not invent symptoms. Do not imply a symptom is present if the patient did not report it. The clinical history confirms — it does not override iris observation.

4. PRIORITISATION: When multiple systems show iris findings, give greater narrative weight to systems where iris signs are confirmed by reported symptoms. These represent the most clinically active areas.
```

- [ ] **Step 2: Add the identical block to the English prompt (`STANDARD_ANALYSIS_SYSTEM_PROMPT_EN`)**

Find the same position in `STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` (around line 68) — after `INTERPRETATION RULES`, before `DETECTED AXES FORMAT` — and insert the exact same block.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/claude/prompts.ts
git commit -m "feat(prompts): add CLINICAL HISTORY INTEGRATION rule for symptom cross-referencing"
```

---

### Task 9: Add formatQuestionnaire and wire clinical history into user prompt

**Files:**
- Modify: `src/lib/claude/analyze.ts`
- Create: `src/lib/claude/__tests__/analyze-prompt.test.ts`

The user prompt is built per-request in `buildUserPrompt`. We add a helper `formatQuestionnaire` that filters to `true` answers, groups them by body system, and appends free-text fields. The resulting block is labelled `PATIENT CLINICAL HISTORY` (matching the label used in the system prompt instruction) so Claude knows exactly what to apply the new rule to.

- [ ] **Step 1: Write failing tests**

Create `src/lib/claude/__tests__/analyze-prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatQuestionnaire } from '../analyze'

describe('formatQuestionnaire', () => {
  it('returns "None reported" when questionnaire is empty', () => {
    const result = formatQuestionnaire({})
    expect(result).toBe('None reported')
  })

  it('lists only positive (true) symptoms grouped by body system', () => {
    const result = formatQuestionnaire({
      digestive: { constipation: true, bloating: true, diarrhea: false },
      nervous: { insomnia: true },
    } as any)
    expect(result).toContain('Digestive: constipation, bloating')
    expect(result).toContain('Nervous: insomnia')
    expect(result).not.toContain('diarrhea')
  })

  it('includes free-text fields when provided', () => {
    const result = formatQuestionnaire({
      medications_supplements: 'Metformin 500mg',
      known_allergies: 'Penicillin',
    } as any)
    expect(result).toContain('Medications/supplements: Metformin 500mg')
    expect(result).toContain('Known allergies: Penicillin')
  })

  it('returns "None reported" when questionnaire is null', () => {
    expect(formatQuestionnaire(null)).toBe('None reported')
    expect(formatQuestionnaire(undefined)).toBe('None reported')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/claude/__tests__/analyze-prompt.test.ts
```
Expected: FAIL — `formatQuestionnaire is not exported from '../analyze'`

- [ ] **Step 3: Add `formatQuestionnaire` and update `buildUserPrompt` in `analyze.ts`**

In `src/lib/claude/analyze.ts`, add this just **before** the `buildUserPrompt` function:

```typescript
const SYSTEM_LABELS: Record<string, string> = {
  digestive: 'Digestive',
  cardiovascular: 'Cardiovascular',
  respiratory: 'Respiratory',
  nervous: 'Nervous',
  musculoskeletal: 'Musculoskeletal',
  endocrine: 'Endocrine',
  urinary: 'Urinary',
  reproductive: 'Reproductive',
  skin_lymphatic: 'Skin/Lymphatic',
  sensory: 'Sensory',
  mental_emotional: 'Mental/Emotional',
  immune: 'Immune',
}

export function formatQuestionnaire(q: Record<string, unknown> | null | undefined): string {
  if (!q) return 'None reported'

  const lines: string[] = []

  for (const [system, label] of Object.entries(SYSTEM_LABELS)) {
    const section = q[system]
    if (!section || typeof section !== 'object') continue
    const positives = Object.entries(section as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k.replace(/_/g, ' '))
    if (positives.length > 0) {
      lines.push(`${label}: ${positives.join(', ')}`)
    }
  }

  const freeTexts: Array<[string, string]> = [
    ['medications_supplements', 'Medications/supplements'],
    ['known_allergies', 'Known allergies'],
    ['past_surgeries', 'Past surgeries'],
    ['family_history', 'Family history'],
  ]
  for (const [key, label] of freeTexts) {
    const val = q[key]
    if (typeof val === 'string' && val.trim()) {
      lines.push(`${label}: ${val.trim()}`)
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'None reported'
}
```

Then update `buildUserPrompt` — change its signature and template string:

```typescript
function buildUserPrompt(
  request: AnalysisRequest,
  previousReportSummary: string | null,
  practitionerCorrections: string | null,
  healthQuestionnaire?: Record<string, unknown> | null,
): string {
  const age = request.patientData.date_of_birth
    ? calculateAge(request.patientData.date_of_birth)
    : 'Not specified'

  return `PATIENT DATA:
- Name: ${request.patientData.full_name}
- Age: ${age}
- Gender: ${request.patientData.gender || 'Not specified'}
- Clinical history: ${request.patientData.general_history || 'Not specified'}
- Current symptoms: ${request.patientData.symptoms || 'Not specified'}
- Practitioner notes: ${request.patientData.practitioner_notes || 'None'}

PREVIOUS FINDINGS (if any):
${previousReportSummary || 'None'}

PRACTITIONER CORRECTIONS (if any):
${practitionerCorrections || 'None'}

PATIENT CLINICAL HISTORY (self-reported symptoms by body system):
${formatQuestionnaire(healthQuestionnaire ?? null)}

IMAGES:
Right and left iris images of the patient are attached.

Analyse both irises and generate the complete clinical report in the specified JSON format. Apply the CLINICAL HISTORY INTEGRATION rules: confirm iris findings that match reported symptoms with explicit causal reasoning; flag unmatched iris findings as preclinical signs. Maintain consistency with previous findings where applicable — if your assessment differs, explain the change.`
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/claude/__tests__/analyze-prompt.test.ts
```
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/analyze.ts src/lib/claude/__tests__/analyze-prompt.test.ts
git commit -m "feat(claude): add formatQuestionnaire helper and PATIENT CLINICAL HISTORY block in user prompt"
```

---

### Task 10: Pass health_questionnaire through upload route

**Files:**
- Modify: `src/lib/claude/analyze.ts` — `analyze()` wrapper
- Modify: `src/app/api/client/upload/route.ts`

The `analyze()` wrapper needs to accept and forward the questionnaire. The upload route reads it from the DB row and passes it down.

- [ ] **Step 1: Update `analyze()` options type in `analyze.ts`**

In the `analyze()` function at the bottom of `src/lib/claude/analyze.ts`, add `health_questionnaire` to the `options` parameter type and pass it to `buildUserPrompt`:

```typescript
// Change options type:
export async function analyze(options: {
  images: [string, string]
  patient: {
    full_name: string
    date_of_birth: string
    general_history: string
    symptoms: string
    practitioner_notes: string
  }
  health_questionnaire?: Record<string, unknown> | null  // ← add this
  language: 'en' | 'es'
  modelId?: string
}): Promise<ReportContent | AnalysisError> {
```

Then, inside `analyze()`, pass it to `analyzeIris`. Since `analyzeIris` calls `buildUserPrompt` internally with `patientContext`, thread the questionnaire through by storing it on the request or by calling `buildUserPrompt` directly in `analyzeIris`.

The cleanest approach: store `health_questionnaire` on the `AnalysisRequest` type, then use it in `buildUserPrompt`.

First, check `src/types/claude.ts` for the `AnalysisRequest` type and add the optional field:

```typescript
// In src/types/claude.ts, add to AnalysisRequest:
health_questionnaire?: Record<string, unknown> | null
```

Then in `analyze()`:
```typescript
  const request: AnalysisRequest = {
    sessionId: '',
    patientId: '',
    patientData: { ... },  // unchanged
    rightIrisBase64: extractBase64(options.images[0]),
    leftIrisBase64: extractBase64(options.images[1]),
    health_questionnaire: options.health_questionnaire ?? null,  // ← add
  }
```

And in `buildUserPrompt` call inside `analyzeIris`, pass `request.health_questionnaire`:

```typescript
    const userPrompt = buildUserPrompt(
      request,
      patientContext.previousReportSummary,
      patientContext.practitionerCorrections,
      request.health_questionnaire,  // ← add
    )
```

Apply the same `request.health_questionnaire` argument to all other `buildUserPrompt` calls inside `analyzeIris` (there are two: one in the retry catch block).

- [ ] **Step 2: Update upload route to read and pass health_questionnaire**

In `src/app/api/client/upload/route.ts`, update the `analyze()` call to include `health_questionnaire`:

```typescript
    const reportContent = await analyze({
      images: [parsed.data.right_eye_base64, parsed.data.left_eye_base64],
      patient: {
        full_name: row.full_name ?? row.email ?? 'Client',
        date_of_birth: row.date_of_birth,
        general_history: '',
        symptoms: row.main_complaint ?? '',
        practitioner_notes: row.current_medications
          ? `Current medications: ${row.current_medications}`
          : '',
      },
      health_questionnaire: row.health_questionnaire ?? null,  // ← add
      language: row.language,
      modelId,
    })
```

Also update the `.select('*')` query to ensure `health_questionnaire` and `full_name` are included (they are, because `*` fetches all columns).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/claude.ts src/lib/claude/analyze.ts src/app/api/client/upload/route.ts
git commit -m "feat(upload): pass health_questionnaire through to Claude prompt"
```

---

### Task 11: Build verification & deploy

- [ ] **Step 1: Run a production build locally**

```bash
npm run build 2>&1 | tail -30
```
Expected: `✓ Compiled successfully` with no type errors.

- [ ] **Step 2: Set ENABLE_MOCK_PAYMENT on Vercel**

In Vercel Dashboard → Project Settings → Environment Variables, add:
```
ENABLE_MOCK_PAYMENT = true
```
Scope: Production + Preview.

- [ ] **Step 3: Deploy to production**

```bash
vercel --prod
```
Expected: deployment URL output, status READY.

- [ ] **Step 4: End-to-end smoke test**

Open the deployed `/client` URL. Walk through:
1. Language selection → tier selection
2. Fill in basic info + a few questionnaire checkboxes
3. Click Continue → mock payment screen → Continue
4. Upload two iris images → wait for analysis
5. Verify report renders

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -p
git commit -m "fix: post-deploy corrections from smoke test"
```

---

## Self-Review

**Spec coverage:**
- [x] Payment bypass: Task 1 replaces NODE_ENV guard with ENABLE_MOCK_PAYMENT
- [x] DB migration: Task 2 adds `health_questionnaire JSONB`
- [x] Zod schema: Task 3 creates `health-questionnaire.ts` with 12 systems + free-text
- [x] Schema merge: Task 4 wires it into the intake schema
- [x] i18n: Task 5 adds EN/ES labels for all ~80 checkbox questions + 4 free-text
- [x] Form UI: Task 6 renders 12 collapsible sections with `BoolField` checkboxes
- [x] Intake API: Task 7 stores `health_questionnaire` in DB
- [x] System prompt: Task 8 adds `CLINICAL HISTORY INTEGRATION` rule to both EN and ES prompts in `prompts.ts`
- [x] User prompt helper: Task 9 adds `formatQuestionnaire` and `PATIENT CLINICAL HISTORY` block; final instruction in prompt tells Claude to apply the integration rules
- [x] End-to-end wiring: Task 10 threads data from upload route → analyze → prompt
- [x] Deploy: Task 11 verifies build + sets env var + smoke test

**Type consistency check:**
- `HealthQuestionnaire` defined in `health-questionnaire.ts` → imported by `client-intake.ts` as the `health_questionnaire` field type
- `AnalysisRequest.health_questionnaire` typed as `Record<string, unknown> | null | undefined` — consistent with `HealthQuestionnaire` once parsed (Zod output is a plain object)
- `formatQuestionnaire` takes `Record<string, unknown> | null | undefined` — safe to receive the DB's raw JSONB
- `buildUserPrompt` fourth arg is `Record<string, unknown> | null | undefined` — all call sites pass `request.health_questionnaire` which has that type
- Section label `PATIENT CLINICAL HISTORY` in `buildUserPrompt` matches exactly what `CLINICAL HISTORY INTEGRATION` rule in `prompts.ts` references — Claude will correctly associate the data with the rule
