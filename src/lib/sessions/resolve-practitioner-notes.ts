// The session form only copies patients.notes when the practitioner changes the
// dropdown. Opening New Session from the patient page pre-selects the patient
// and submits an empty box, so the analysis never sees notes that were already
// saved on the record. Read them here, at generate time, when the box is empty.
// Notes typed on the session win: that box is the per-session override.
//
// `from` returns `any` on purpose. A hand-written query type here makes tsc
// instantiate the Supabase client generics until it hits TS2589
// ("Type instantiation is excessively deep"), which failed the staging build.

type PatientNotesClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export async function resolvePractitionerNotes(
  supabase: PatientNotesClient,
  patientId: string,
  submitted: string | null | undefined,
): Promise<string | null> {
  const fromForm = submitted?.trim() ?? ''
  if (fromForm) return fromForm
  if (!patientId) return null

  try {
    const { data, error } = await supabase.from('patients').select('notes').eq('id', patientId).single()
    if (error || !data?.notes) return null
    const fromPatient = data.notes.trim()
    return fromPatient || null
  } catch {
    return null
  }
}
