# Languages

## Where each piece lives

- `src/lib/i18n.ts` — `en`/`es`/`de` dictionary, `t(lang, key)`, `detectLocale(navigator.language)`.
- `src/lib/i18n-context.tsx` — language provider for the client UI.
- `client_analyses.language` — the only language column persisted anywhere in the app (constraint: en/es/de only). Passed as the `language` parameter to `analyzeIrisDual()` along with `forceLanguage: true` (the model must write EVERYTHING in that language, no exceptions).

## What does NOT exist

`reports` has no language column. It never has. Any "what language is this report in" in the practitioner UI (`ReportViewer`) is React state (`useState<'en'|'es'|'de'>`, with an on-demand translation cache via `/api/translate`) — never persisted. If the component remounts, that state is lost and falls back to the default.

## Bug already fixed on this branch, as a reference pattern

`report-viewer.tsx` saved one section and wiped the ENTIRE translation cache (`setTranslatedCache({})`) instead of just the touched section — the rest of the translated report reverted to its native text on save. Fix: invalidate only the edited key per cached language. See commit `33d3443` on `fix/practitioner-report-language-loss`. This is a useful precedent: any "language" that lives only in component state is fragile to this exact bug pattern.

## /api/translate vs /api/client/reports/[token]/translate

These are TWO different routes. The practitioner one assumes the source `report_content` is English ("Translate English iridology report content into...") — it never checks the actual source language. The client one operates on `client_report_translations`, which is actually persisted.
