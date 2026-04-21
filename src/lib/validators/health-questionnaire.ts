import { z } from 'zod'

const boolField = z.boolean().default(false)

const withDefault = <T extends z.ZodRawShape>(shape: T) =>
  z.preprocess((v) => v ?? {}, z.object(shape))

export const healthQuestionnaireSchema = z.object({
  digestive: withDefault({
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
  }),

  cardiovascular: withDefault({
    palpitations: boolField,
    chest_pain: boolField,
    hypertension: boolField,
    varicose_veins: boolField,
    poor_circulation: boolField,
    anemia: boolField,
    frequent_bruising: boolField,
  }),

  respiratory: withDefault({
    asthma: boolField,
    frequent_colds: boolField,
    chronic_cough: boolField,
    shortness_of_breath: boolField,
    sinusitis: boolField,
    seasonal_allergies: boolField,
    bronchitis: boolField,
  }),

  nervous: withDefault({
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
  }),

  musculoskeletal: withDefault({
    joint_pain: boolField,
    back_pain: boolField,
    arthritis: boolField,
    muscle_cramps: boolField,
    osteoporosis: boolField,
    sciatica: boolField,
    neck_pain: boolField,
    fibromyalgia: boolField,
  }),

  endocrine: withDefault({
    thyroid_problems: boolField,
    diabetes: boolField,
    weight_gain: boolField,
    weight_loss: boolField,
    excessive_fatigue: boolField,
    temperature_sensitivity: boolField,
    excessive_thirst: boolField,
    adrenal_issues: boolField,
  }),

  urinary: withDefault({
    kidney_stones: boolField,
    frequent_urination: boolField,
    urinary_infections: boolField,
    incontinence: boolField,
    dark_urine: boolField,
    kidney_pain: boolField,
  }),

  reproductive: withDefault({
    menstrual_irregularities: boolField,
    menopause_symptoms: boolField,
    libido_changes: boolField,
    prostate_issues: boolField,
    fertility_issues: boolField,
    hormonal_imbalance: boolField,
  }),

  skin_lymphatic: withDefault({
    acne: boolField,
    eczema: boolField,
    psoriasis: boolField,
    frequent_infections: boolField,
    swollen_lymph_nodes: boolField,
    excessive_sweating: boolField,
    dry_skin: boolField,
    hair_loss: boolField,
    nail_problems: boolField,
  }),

  sensory: withDefault({
    vision_problems: boolField,
    hearing_loss: boolField,
    tinnitus: boolField,
    frequent_nosebleeds: boolField,
    taste_smell_changes: boolField,
    dry_eyes: boolField,
    ear_infections: boolField,
  }),

  mental_emotional: withDefault({
    chronic_stress: boolField,
    mood_swings: boolField,
    panic_attacks: boolField,
    obsessive_thoughts: boolField,
    emotional_eating: boolField,
    social_withdrawal: boolField,
    burnout: boolField,
  }),

  immune: withDefault({
    autoimmune_disease: boolField,
    frequent_allergies: boolField,
    chronic_fatigue_syndrome: boolField,
    food_sensitivities: boolField,
    chemical_sensitivities: boolField,
    slow_wound_healing: boolField,
    frequent_fever: boolField,
  }),

  medications_supplements: z.string().max(2000).optional(),
  known_allergies: z.string().max(1000).optional(),
  past_surgeries: z.string().max(1000).optional(),
  family_history: z.string().max(2000).optional(),
})

export type HealthQuestionnaire = z.infer<typeof healthQuestionnaireSchema>
