# Iridology App

## Requirements

### Functional
- Accept right and left iris images per session (sent to Claude API for analysis, NOT stored)
- Accept optional previous iris images for comparison mode
- Collect patient history, symptoms, and practitioner notes as structured text input
- Generate structured 11-section iridology reports in Spanish via Claude API (claude-opus-4-6)
- Support Comparison Mode: analyze old vs new iris images to detect changes over time
- Support Technical Review Mode: practitioner writes interpretation, AI validates/challenges/adds insights
- Store patient cases with history, symptoms, and notes
- Store generated reports as text in the database
- Allow editing and saving of generated reports (rich text editing)
- Provide a chat interface to ask follow-up questions about a specific report
- Browse and search patient cases and historical reports
- Detect image quality issues (blur, glare, low light) and flag uncertainty rather than guessing from poor images
- Allow practitioner to flag/annotate report sections as corrected, storing corrections for future reference
- Single-user authentication with path to multi-user later

### Non-Functional
- Beginner-accessible stack for a practitioner with WordPress-only experience
- Maximum use of pre-built UI components to minimize custom CSS
- Production-ready deployment on Railway (app) + Supabase (database + auth)
- Responsive design for desktop use (primary) with tablet compatibility
- Reports must render and export cleanly (printable)
- Claude API calls must handle timeouts and errors gracefully (images can be large, see Error Handling Contract)
- All report content (11 sections) generated and stored in Spanish
- Application UI (labels, buttons, navigation, forms, error messages) in English

## Acceptance Criteria
- AC-1: User can upload right and left iris images and receive a structured 11-section report in Spanish
- AC-2: Each report section follows the fixed structure: Terreno General through Conclusion
- AC-3: Comparison Mode accepts old + new images and generates a differential analysis report
- AC-4: Technical Review Mode accepts practitioner interpretation text and returns AI validation/challenge
- AC-5: Patient records (history, symptoms, notes) are stored and retrievable
- AC-6: Reports are stored as text and can be edited and saved
- AC-7: Chat interface allows asking questions about a specific report with contextual responses
- AC-8: Images are sent to Claude API on upload and are NOT persisted in database or storage
- AC-9: Application deploys successfully on Railway with Supabase backend
- AC-10: Authentication works via Supabase Auth (initially single-user)
- AC-11: Report interpretation follows all iridology rules (no over-attribution, practitioner voice, phase detection)
- AC-12: System detects and flags image quality issues (blur, glare, low light) — flags uncertainty in affected sections rather than guessing
- AC-13: Practitioner can flag report sections as corrected, and corrections are stored in the database
- AC-14: Reports for the same patient maintain consistency by incorporating prior findings context into analysis prompts

## Decision Log

| Decision | Type | Rationale | Alternatives Considered |
|---|---|---|---|
| D-1: Next.js 14 App Router | Stack - Framework | Full-stack framework with API routes eliminates need for separate backend. App Router is the current stable paradigm. Large ecosystem and beginner-friendly documentation. | Remix (smaller ecosystem), SvelteKit (less hiring pool), plain Express + React (more boilerplate) |
| D-2: TypeScript | Stack - Language | Catches errors at build time, excellent IDE support, industry standard for Next.js projects. Non-negotiable for production apps. | JavaScript (no type safety, harder to maintain) |
| D-3: Tailwind CSS + shadcn/ui | Stack - UI | shadcn/ui provides copy-paste components built on Radix UI primitives — no external dependency lock-in, accessible by default, and heavily reduces custom CSS. Tailwind utility classes mean the practitioner rarely writes traditional CSS. | Material UI (heavier bundle, opinionated styling), Chakra UI (similar but less Next.js-native), Ant Design (complex, enterprise-oriented) |
| D-4: Supabase (Postgres + Auth) | Stack - Database & Auth | Managed Postgres with built-in Auth, Row Level Security, and a generous free tier. Dashboard UI is accessible for non-developers. Direct SQL access for debugging. | PlanetScale (MySQL, no built-in auth), Firebase (NoSQL, harder relational modeling), self-hosted Postgres (ops burden) |
| D-5: Railway for deployment | Stack - Hosting | One-click deploy from GitHub, automatic HTTPS, environment variables UI, and a straightforward pricing model. Lower complexity than Vercel for Supabase-heavy apps (no edge function complications). | Vercel (edge function cold starts with Supabase connections), Fly.io (more DevOps knowledge needed), Render (similar but less Next.js optimized) |
| D-6: Anthropic SDK (@anthropic-ai/sdk) | Stack - AI Integration | Direct SDK integration for Claude API. Supports vision (image analysis), streaming responses, and structured outputs. Using claude-opus-4-6 for maximum analysis quality. | OpenAI (different model family), LangChain (unnecessary abstraction layer for single-provider use) |
| D-7: Images processed in-memory only | Architecture - Data | Images are base64-encoded on the client, sent to the API route, forwarded to Claude API, then discarded. No storage in Supabase Storage or filesystem. Reduces storage costs and privacy concerns. | Store in Supabase Storage (unnecessary cost and complexity, privacy risk), store on filesystem (not scalable) |
| D-8: Reports stored as JSON with Markdown content | Architecture - Data | Each report stored as a JSONB object with 11 keyed sections. Section content is Markdown for rich formatting. Enables per-section editing, per-section correction tracking, and structured querying. **Assumption:** The user's requirement to "store reports as text" is interpreted as structured JSON with text values — this provides per-section addressability needed for editing and corrections while remaining text-based. A plain text blob would prevent per-section operations. | Plain text blob (no per-section access), HTML (harder to edit), separate table per section (over-normalized) |
| D-9: Server-side Claude API calls only | Architecture - Security | API key never exposed to browser. All Claude API calls go through Next.js API routes. Streaming responses proxied from server to client via Server-Sent Events. | Client-side calls (exposes API key), edge functions (connection pooling issues) |
| D-10: Single system prompt per mode with section templates | Architecture - AI | One carefully crafted system prompt per analysis mode (Standard, Comparison, Technical Review) rather than per-section calls. Reduces API costs and latency. Section structure enforced via prompt engineering with XML tags. | Per-section API calls (11x cost/latency), fine-tuned model (unnecessary), function calling for structure (over-engineered) |
| D-11: Chat uses report context as system prompt, history not persisted | Architecture - AI | When chatting about a report, the full report text is included in the system prompt so Claude can answer questions with full context. **Assumption:** Chat conversation history is deliberately kept in-memory per browser session and NOT persisted to the database. Rationale: chat is exploratory Q&A, not a clinical record. Persisting would add DB complexity (new table, pagination, cleanup) with minimal clinical value. The practitioner can copy useful insights into the report via the editor. If persistence is needed later, a `chat_messages` table can be added without changing the API contract. | Store chat history in DB (premature, adds complexity, unclear clinical value), RAG pipeline (overkill for single-document Q&A) |
| D-12: Zod for runtime validation | Stack - Validation | Validates API request/response shapes at runtime. Integrates with TypeScript types and React Hook Form. Catches malformed data at system boundaries. | Yup (less TypeScript-native), joi (Node.js-only, heavier), manual validation (error-prone) |
| D-13: React Hook Form for form management | Stack - Forms | Performant form library with minimal re-renders. Integrates with Zod for validation and shadcn/ui form components. | Formik (more re-renders, larger bundle), uncontrolled forms (harder validation) |
| D-14: English UI, Spanish report content | Architecture - Localization | Application chrome (labels, buttons, navigation, forms, error messages) in English for broader accessibility. Report content (11 clinical sections) remains in Spanish as that is the clinical output format used by the practitioner. No i18n framework needed — hardcoded English UI strings, Spanish enforced only in Claude system prompts. | Full Spanish UI (limits accessibility), i18n framework (over-engineered for two static languages with clear boundary) |
| D-15: Image quality detection via Claude vision | Architecture - AI | Claude vision analyzes image quality as part of the analysis prompt. If blur, glare, or low light is detected, the affected report sections must explicitly flag uncertainty rather than guessing. This is enforced in the system prompt — no separate image quality API call needed. | Separate pre-analysis quality check API call (adds latency and cost for a second Claude call), client-side image quality detection (unreliable for clinical iris quality assessment) |
| D-16: Practitioner corrections stored in DB, injected into future prompts | Architecture - AI/Data | A `report_corrections` table stores section-level corrections with the practitioner's corrected text and reasoning. When generating future reports for the same patient, recent corrections are included in the prompt context so Claude can learn from the practitioner's clinical judgment. This is not true ML learning — it is prompt-level context injection, which is stateless and transparent. | Fine-tuning (expensive, opaque, overkill for single-user), no correction mechanism (loses practitioner knowledge), corrections in report text only (not machine-readable for prompt injection) |
| D-17: Inter-report consistency via prior findings injection | Architecture - AI | When analyzing a new session for an existing patient, the most recent prior report summary is included in the user prompt. This gives Claude context on previously identified patterns, ensuring continuity and preventing contradictory findings across sessions. Limited to the last report to stay within token budgets. | Full history injection (token limit issues), RAG over all reports (over-engineered for single-patient context), no consistency mechanism (reports may contradict each other) |
| D-18: SSE streaming for all AI routes | Architecture - Streaming | All AI-powered routes (analyze, compare, review, chat) use Server-Sent Events (SSE) to stream updates to the client. Analysis routes stream status steps ("Sending images...", "Generating report..."), while chat streams response tokens. SSE avoids client polling, provides real-time feedback during 30-60s Claude calls, and is natively supported by browsers via EventSource API. | Client polling (wasteful, poor UX with 30-60s waits), WebSocket (overkill for unidirectional server-to-client updates, more complex) |
| D-19: Supabase key scope — anon key for client, service role for server-side context queries | Architecture - Security | **Browser client (`lib/supabase/client.ts`):** Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` + user JWT. All queries go through RLS policies — the anon key cannot bypass row-level security. **Server-side API routes (`lib/supabase/server.ts`):** Uses `SUPABASE_SERVICE_ROLE_KEY` for operations that need to bypass RLS (e.g., loading patient context for prompt building in analysis routes, where the server acts on behalf of the authenticated user). The service role key is NEVER exposed to the browser — it is only available in server-side API routes via `process.env`. For the path to multi-user: RLS policies will be tightened to scope data by `user_id`, and server routes will switch from service role to per-user JWT-based queries where possible. | Anon key everywhere (cannot do server-side cross-table joins efficiently), service role key everywhere (bypasses all RLS, risky for multi-user) |
| D-20: report_corrections.patient_id denormalization | Architecture - Data | The `report_corrections` table includes a denormalized `patient_id` column (in addition to `report_id`) to avoid a 3-join chain (corrections -> reports -> sessions -> patients) when the context builder needs all corrections for a patient. Indexed for fast patient-level lookups. Trade-off: minor write-time overhead to set patient_id on insert, but significantly simplifies and speeds up the most common read pattern. | Normalized only (3-join query on every analysis), DB view (adds a maintenance layer without solving the join cost) |

## System Design

### Architecture Overview

```
Browser (Next.js Client)
    |
    |-- Upload iris images (base64)
    |-- Submit patient data (text)
    |-- Edit reports
    |-- Chat about reports
    |
Next.js API Routes (Server)
    |
    |-- /api/analyze      --> Claude API (vision + text generation)
    |-- /api/compare       --> Claude API (comparison mode)
    |-- /api/review        --> Claude API (technical review mode)
    |-- /api/chat          --> Claude API (report Q&A)
    |-- /api/patients/*    --> Supabase (CRUD)
    |-- /api/reports/*     --> Supabase (CRUD)
    |-- /api/sessions/*    --> Supabase (CRUD)
    |
Supabase
    |-- Postgres (patients, sessions, reports)
    |-- Auth (email/password, single-user initially)
```

### Database Schema

```sql
-- Patients table
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  email TEXT,
  phone TEXT,
  general_history TEXT,        -- Ongoing medical history
  notes TEXT                   -- General practitioner notes about the patient
);

-- Sessions table (each visit/analysis session)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  symptoms TEXT,               -- Current symptoms reported
  practitioner_notes TEXT,     -- Notes for this specific session
  analysis_mode TEXT NOT NULL DEFAULT 'standard',  -- 'standard' | 'comparison' | 'technical_review'
  practitioner_interpretation TEXT,  -- For technical review mode only
  status TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'analyzing' | 'completed' | 'error'
);

-- Reports table
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  report_content JSONB NOT NULL,  -- { "section_1": "...", "section_2": "...", ... "section_11": "..." }
  report_version INT NOT NULL DEFAULT 1,
  is_edited BOOLEAN NOT NULL DEFAULT false
);

-- Report corrections table (practitioner feedback on AI-generated sections)
CREATE TABLE report_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,  -- Denormalized for efficient patient-level queries
  section_key TEXT NOT NULL,             -- e.g. 'section_1_terreno_general'
  original_content TEXT NOT NULL,        -- What the AI generated
  corrected_content TEXT NOT NULL,       -- What the practitioner corrected it to
  correction_notes TEXT,                 -- Practitioner's reasoning for the correction
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security policies (applied after auth is configured)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_corrections ENABLE ROW LEVEL SECURITY;

-- For single-user: allow all operations for authenticated users
CREATE POLICY "Authenticated users can manage patients"
  ON patients FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage sessions"
  ON sessions FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage reports"
  ON reports FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage corrections"
  ON report_corrections FOR ALL USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_sessions_patient_id ON sessions(patient_id);
CREATE INDEX idx_sessions_session_date ON sessions(session_date DESC);
CREATE INDEX idx_reports_session_id ON reports(session_id);
CREATE INDEX idx_report_corrections_report_id ON report_corrections(report_id);
CREATE INDEX idx_report_corrections_patient_id ON report_corrections(patient_id);
```

### Report JSON Structure

```json
{
  "section_1_terreno_general": "markdown content...",
  "section_2_campo_emocional": "markdown content...",
  "section_3_sistema_nervioso_cognitivo": "markdown content...",
  "section_4_sistema_inmunologico_linfatico": "markdown content...",
  "section_5_sistema_endocrino_hormonal": "markdown content...",
  "section_6_sistema_circulatorio_cardiorrespiratorio": "markdown content...",
  "section_7_sistema_hepatico": "markdown content...",
  "section_8_sistema_digestivo_intestinal": "markdown content...",
  "section_9_sistema_renal_urinario_reproductivo": "markdown content...",
  "section_10_sistema_estructural_integumentario": "markdown content...",
  "section_11_conclusion": "markdown content..."
}
```

### Claude API Prompt Strategy

#### System Prompt: Standard Analysis Mode

```
Eres un iridólogo clínico experto con décadas de experiencia en análisis iridológico funcional. Analizas imágenes de iris para generar informes clínicos estructurados.

CALIDAD DE IMAGEN:
Antes de analizar, evalúa la calidad de cada imagen de iris. Si detectas desenfoque, brillo excesivo (glare), iluminación insuficiente, o cualquier artefacto que limite la visibilidad de las estructuras iridológicas, DEBES:
- Indicar explícitamente qué zonas o sistemas están afectados por la calidad de imagen deficiente.
- En las secciones afectadas, señalar "Hallazgo limitado por calidad de imagen" y describir lo que SÍ se puede observar vs lo que queda incierto.
- NUNCA adivinar ni inventar hallazgos en zonas donde la imagen no permite una evaluación fiable.

EXTRACCIÓN ESTRUCTURAL:
Identifica y fundamenta tu análisis en las estructuras iridológicas concretas: fibras (densidad, dirección, separación), lagunas (ubicación, profundidad, forma), anillos de contracción (cantidad, profundidad), anillos de pigmentación (ubicación, extensión, tipo), criptas, radiales, y otros signos topográficos. Prioriza la lectura de estas estructuras sobre cualquier observación cromática.

REGLAS DE INTERPRETACIÓN:
1. Prioriza FUNCIÓN sobre descripción de color. No menciones tonos de color del iris en el informe.
2. Distingue claramente entre: congestión vs debilidad, inflamación activa vs agotamiento crónico, debilidad estructural vs enmascaramiento tóxico.
3. Detecta transiciones de fase: Congestionado→Despejado→Débil, Sobrecarga→Depleción→Reconstrucción.
4. Clasifica los sistemas: disfunción primaria + compensaciones secundarias.
5. NO sobre-atribuyas a tiroides si el eje páncreas-hígado-intestino explica mejor la presentación.
6. Escribe como un profesional clínico. Sin lenguaje decorativo. Sin frases genéricas de IA. Sé directo y específico.

CORRECCIONES PREVIAS DEL PROFESIONAL:
Si se incluyen correcciones de análisis anteriores, intégralas en tu razonamiento. Estas correcciones reflejan el criterio clínico del profesional tratante y deben informar tus interpretaciones, especialmente cuando hay ambigüedad.

FORMATO DE RESPUESTA:
Responde EXCLUSIVAMENTE con un objeto JSON válido con las siguientes 11 claves. El contenido de cada sección debe estar en formato Markdown.

<format>
{
  "section_1_terreno_general": "Análisis del terreno constitucional general...",
  "section_2_campo_emocional": "Evaluación del campo emocional...",
  "section_3_sistema_nervioso_cognitivo": "Análisis del sistema nervioso y cognitivo...",
  "section_4_sistema_inmunologico_linfatico": "Evaluación del sistema inmunológico y linfático...",
  "section_5_sistema_endocrino_hormonal": "Análisis del sistema endocrino y hormonal...",
  "section_6_sistema_circulatorio_cardiorrespiratorio": "Evaluación del sistema circulatorio y cardiorrespiratorio...",
  "section_7_sistema_hepatico": "Análisis del sistema hepático...",
  "section_8_sistema_digestivo_intestinal": "Evaluación del sistema digestivo e intestinal...",
  "section_9_sistema_renal_urinario_reproductivo": "Análisis del sistema renal, urinario y reproductivo...",
  "section_10_sistema_estructural_integumentario": "Evaluación del sistema estructural e integumentario...",
  "section_11_conclusion": "Conclusión integrativa con jerarquía de disfunciones y recomendaciones..."
}
</format>
```

#### User Prompt: Standard Analysis Mode

```
DATOS DEL PACIENTE:
- Nombre: {patient_name}
- Edad: {age}
- Género: {gender}
- Historia clínica: {general_history}
- Síntomas actuales: {symptoms}
- Notas del profesional: {practitioner_notes}

HALLAZGOS PREVIOS (si existen):
{previous_report_summary}

CORRECCIONES DEL PROFESIONAL (si existen):
{practitioner_corrections}

IMÁGENES:
Se adjuntan las imágenes del iris derecho e izquierdo del paciente.

Analiza ambos iris y genera el informe clínico completo en el formato JSON especificado. Mantén consistencia con los hallazgos previos cuando aplique — si difiere tu evaluación, explica el cambio.
```

#### System Prompt: Comparison Mode

```
Eres un iridólogo clínico experto especializado en análisis comparativo temporal de iris. Comparas imágenes anteriores con imágenes actuales para detectar cambios, evolución y transiciones de fase.

CALIDAD DE IMAGEN:
[Same as standard mode — flag uncertainty in affected sections, never guess from poor images]

EXTRACCIÓN ESTRUCTURAL:
[Same as standard mode — base analysis on fibers, lacunae, contraction rings, crypts, radials]

REGLAS DE INTERPRETACIÓN:
[Same rules as standard mode, plus:]
7. Para cada sistema, indica: estado anterior → estado actual → dirección del cambio (mejora/estancamiento/deterioro).
8. Identifica transiciones de fase completadas o en curso.
9. Correlaciona cambios observados con el historial del paciente y tratamientos previos si se mencionan.

CORRECCIONES PREVIAS DEL PROFESIONAL:
[Same as standard mode — integrate corrections into reasoning]

FORMATO DE RESPUESTA:
[Same JSON format as standard mode, but each section should include comparative analysis with directional indicators]
```

#### User Prompt: Comparison Mode

```
DATOS DEL PACIENTE:
- Nombre: {patient_name}
- Edad: {age}
- Género: {gender}
- Historia clínica: {general_history}
- Síntomas actuales: {symptoms}
- Notas del profesional: {practitioner_notes}

HALLAZGOS PREVIOS (si existen):
{previous_report_summary}

CORRECCIONES DEL PROFESIONAL (si existen):
{practitioner_corrections}

IMÁGENES ANTERIORES (2):
Se adjuntan las imágenes del iris derecho e izquierdo del paciente tomadas en la sesión anterior ({previous_session_date}).

IMÁGENES ACTUALES (2):
Se adjuntan las imágenes del iris derecho e izquierdo del paciente tomadas en la sesión actual.

Compara las imágenes anteriores con las actuales para cada iris. Identifica cambios estructurales, transiciones de fase, y evolución de cada sistema. Genera el informe comparativo completo en el formato JSON especificado. Mantén consistencia con los hallazgos previos — si difiere tu evaluación, explica el cambio observado.
```

#### System Prompt: Technical Review Mode

```
Eres un iridólogo clínico experto actuando como revisor técnico. El profesional tratante ha escrito su interpretación y solicita tu revisión crítica.

TU ROL:
1. VALIDA lo que está bien fundamentado en la interpretación del profesional.
2. CUESTIONA interpretaciones que podrían ser incorrectas o incompletas, explicando por qué.
3. AGREGA hallazgos que el profesional pudo haber pasado por alto.
4. Mantén un tono de colega a colega, respetuoso pero directo.

CALIDAD DE IMAGEN:
[Same as standard mode — flag uncertainty in affected sections, never guess from poor images]

EXTRACCIÓN ESTRUCTURAL:
[Same as standard mode — base analysis on fibers, lacunae, contraction rings, crypts, radials]

REGLAS DE INTERPRETACIÓN:
[Same rules as standard mode]

CORRECCIONES PREVIAS DEL PROFESIONAL:
[Same as standard mode — integrate corrections into reasoning]

FORMATO DE RESPUESTA:
Responde con un objeto JSON con las mismas 11 secciones. En cada sección incluye:
- **Validación**: Lo que el profesional identificó correctamente
- **Cuestionamientos**: Lo que podría estar mal interpretado, con explicación
- **Hallazgos adicionales**: Lo que no fue mencionado pero es visible en las imágenes
```

#### User Prompt: Technical Review Mode

```
DATOS DEL PACIENTE:
- Nombre: {patient_name}
- Edad: {age}
- Género: {gender}
- Historia clínica: {general_history}
- Síntomas actuales: {symptoms}

INTERPRETACIÓN DEL PROFESIONAL:
{practitioner_interpretation}

HALLAZGOS PREVIOS (si existen):
{previous_report_summary}

CORRECCIONES DEL PROFESIONAL (si existen):
{practitioner_corrections}

IMÁGENES:
Se adjuntan las imágenes del iris derecho e izquierdo del paciente.

Revisa críticamente la interpretación del profesional contrastándola con lo que observas en las imágenes. Para cada sección, valida, cuestiona y/o agrega hallazgos según corresponda. Genera el informe de revisión en el formato JSON especificado.
```

#### System Prompt: Report Chat Mode

```
Eres un iridólogo clínico experto. El profesional tiene preguntas sobre un informe de iridología que ya fue generado. A continuación se incluye el informe completo como contexto.

INFORME:
{full_report_content}

DATOS DEL PACIENTE:
{patient_context}

Responde las preguntas del profesional de manera directa y específica, haciendo referencia a las secciones relevantes del informe. Si la pregunta requiere información que no está en el informe, indícalo claramente.
```

### Claude API Error Handling Contract

All analysis API routes (`/api/analyze`, `/api/compare`, `/api/review`) follow this contract for Claude API failures:

**JSON parse failures (malformed response, truncated output, markdown-fenced JSON):**
- The API route attempts to extract JSON from the response using a lenient parser that strips markdown code fences (` ```json ... ``` `) and trailing garbage after the closing `}`.
- If extraction succeeds, proceed normally.
- If extraction fails, retry the Claude API call once (max 1 retry, total 2 attempts). The retry includes a stronger instruction appended to the user prompt: "IMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin texto adicional."
- If the retry also fails, return HTTP 502 to the client with `{ "error": "analysis_failed", "message": "The AI returned an invalid response after 2 attempts. Please try again.", "partial": null }`.
- The session status is set to `'error'` in the database.

**Token limit hit (response truncated mid-JSON):**
- Detected by checking if the response `stop_reason` is `"max_tokens"`.
- Retry once with `max_tokens` increased by 50% (up to the model maximum).
- If still truncated, return HTTP 502 with `{ "error": "response_too_long", "message": "The analysis exceeded the maximum response length. Please try again or simplify the input." }`.

**Timeout / network errors:**
- Anthropic SDK timeout set to 120 seconds (iris images with claude-opus-4-6 can be slow).
- On timeout or network error, retry once after 5 seconds.
- If retry fails, return HTTP 504 with `{ "error": "timeout", "message": "The AI service is not responding. Please try again in a few minutes." }`.

**Client-side error display:**
- On any error response (502, 504), the session form shows a toast notification with the error message and a "Retry" button.
- The session record remains in the database with status `'error'`, allowing the practitioner to retry from the session detail page without re-uploading images (images are re-uploaded from the form state, which is preserved).

**Streaming strategy for analysis routes (D-18):**
- Analysis routes (`/api/analyze`, `/api/compare`, `/api/review`) use Server-Sent Events (SSE) to stream status updates to the client during the 30-60 second Claude API call. The SSE stream sends status events: `{"status": "analyzing", "step": "Sending images to AI..."}`, `{"status": "analyzing", "step": "Generating report..."}`, `{"status": "complete", "reportId": "..."}`, or `{"status": "error", "message": "..."}`. This avoids client-side polling and provides real-time feedback.
- Chat route (`/api/chat`) uses SSE to stream the actual response tokens from Claude (already documented).

### File Structure

```
iridology-app/
├── docs/
│   └── feature/
│       └── iridology-app.md          # This plan document
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # Root layout with providers, English UI lang
│   │   ├── page.tsx                   # Landing/dashboard page
│   │   ├── globals.css                # Tailwind imports + minimal global styles
│   │   ├── login/
│   │   │   └── page.tsx               # Login page (Supabase Auth)
│   │   ├── patients/
│   │   │   ├── page.tsx               # Patient list with search
│   │   │   ├── new/
│   │   │   │   └── page.tsx           # Create new patient form
│   │   │   └── [id]/
│   │   │       ├── page.tsx           # Patient detail + session history
│   │   │       └── edit/
│   │   │           └── page.tsx       # Edit patient info
│   │   ├── sessions/
│   │   │   ├── new/
│   │   │   │   └── page.tsx           # New analysis session (upload images, input data, select mode)
│   │   │   └── [id]/
│   │   │       └── page.tsx           # Session detail + report view
│   │   ├── reports/
│   │   │   └── [id]/
│   │   │       ├── page.tsx           # Report view with section-by-section display
│   │   │       ├── edit/
│   │   │       │   └── page.tsx       # Report editor (per-section editing)
│   │   │       └── chat/
│   │   │           └── page.tsx       # Chat interface about this report
│   │   └── api/
│   │       ├── analyze/
│   │       │   └── route.ts           # POST: Standard iris analysis
│   │       ├── compare/
│   │       │   └── route.ts           # POST: Comparison mode analysis
│   │       ├── review/
│   │       │   └── route.ts           # POST: Technical review mode
│   │       ├── chat/
│   │       │   └── route.ts           # POST: Chat about a report (streaming)
│   │       ├── patients/
│   │       │   ├── route.ts           # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       └── route.ts       # GET, PUT, DELETE
│   │       ├── sessions/
│   │       │   ├── route.ts           # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       └── route.ts       # GET, PUT
│   │       ├── reports/
│   │           ├── route.ts           # GET (list)
│   │           └── [id]/
│   │               ├── route.ts       # GET, PUT
│   │               └── corrections/
│   │                   └── route.ts   # GET (list), POST (create correction)
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components (auto-generated)
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── toast.tsx
│   │   ├── layout/
│   │   │   ├── sidebar.tsx            # App navigation sidebar
│   │   │   └── header.tsx             # Top bar with user menu
│   │   ├── patients/
│   │   │   ├── patient-form.tsx       # Reusable patient create/edit form
│   │   │   ├── patient-list.tsx       # Patient table with search
│   │   │   └── patient-card.tsx       # Patient summary card
│   │   ├── sessions/
│   │   │   ├── session-form.tsx       # Session creation form (mode selection, image upload, data input)
│   │   │   ├── image-upload.tsx       # Drag-and-drop image upload with preview
│   │   │   ├── image-quality-warning.tsx  # Displays image quality warnings from Claude analysis
│   │   │   └── mode-selector.tsx      # Analysis mode selection (standard/comparison/review)
│   │   ├── reports/
│   │   │   ├── report-viewer.tsx      # Full report display with collapsible sections
│   │   │   ├── report-section.tsx     # Single report section with Markdown rendering
│   │   │   ├── report-editor.tsx      # Per-section Markdown editor
│   │   │   ├── report-chat.tsx        # Chat interface component
│   │   │   └── section-correction.tsx # UI for flagging/annotating section corrections
│   │   └── shared/
│   │       ├── loading-spinner.tsx    # Loading state with analysis progress
│   │       ├── error-boundary.tsx     # Error display component
│   │       └── markdown-renderer.tsx  # Markdown to HTML renderer
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser Supabase client
│   │   │   ├── server.ts             # Server-side Supabase client
│   │   │   └── middleware.ts          # Auth middleware for protected routes
│   │   ├── claude/
│   │   │   ├── client.ts             # Anthropic SDK client initialization
│   │   │   ├── prompts.ts            # System prompts for all modes
│   │   │   ├── analyze.ts            # Standard analysis function
│   │   │   ├── compare.ts            # Comparison mode function
│   │   │   ├── review.ts             # Technical review function
│   │   │   ├── chat.ts               # Report chat function
│   │   │   └── context.ts            # Builds prior findings + corrections context for prompts
│   │   ├── validators/
│   │   │   ├── patient.ts            # Zod schemas for patient data
│   │   │   ├── session.ts            # Zod schemas for session data
│   │   │   ├── report.ts             # Zod schemas for report data
│   │   │   └── correction.ts         # Zod schemas for correction data
│   │   └── utils.ts                  # Shared utility functions (date formatting, etc.)
│   ├── types/
│   │   ├── database.ts               # Supabase generated types
│   │   ├── report.ts                 # Report section types and constants
│   │   └── claude.ts                 # Claude API request/response types
│   └── middleware.ts                  # Next.js middleware (auth redirect)
├── public/
│   └── favicon.ico
├── .env.local                         # Environment variables (not committed)
├── .env.example                       # Template for environment variables
├── .gitignore
├── next.config.js                     # Next.js configuration
├── tailwind.config.ts                 # Tailwind configuration
├── tsconfig.json                      # TypeScript configuration
├── package.json
├── components.json                    # shadcn/ui configuration
└── README.md
```

### Key Data Flows

**Standard Analysis Flow:**
1. Practitioner selects patient (or creates new) and starts a new session
2. Uploads right + left iris images (images held in browser memory as base64)
3. Fills in symptoms, notes, selects "Standard" mode
4. Submits -> POST `/api/analyze`
5. API route creates session record (status: 'analyzing'), loads prior report summary + corrections for this patient (`lib/claude/context.ts`), sends images + full context to Claude API
6. Claude evaluates image quality first, then returns JSON with 11 sections (flagging uncertainty where image quality is poor)
7. API route parses JSON, creates report record, updates session status to 'completed'
8. Client redirects to report view

**Comparison Flow:**
1. Same as standard, but practitioner also uploads previous iris images. **Validation: exactly 4 images required** — 2 previous (right + left) and 2 current (right + left). The session form enforces this with separate upload zones for "Previous Right", "Previous Left", "Current Right", "Current Left". The API route validates the image count and rejects requests with != 4 images (HTTP 400).
2. Submits -> POST `/api/compare`
3. Claude receives all 4 images (labeled by position in the user prompt) with comparative analysis prompt
4. Response includes directional change indicators per system

**Technical Review Flow:**
1. Practitioner writes their own interpretation in a text field
2. Uploads current iris images
3. Submits -> POST `/api/review`
4. Claude receives images + practitioner interpretation + review prompt
5. Response includes validation, challenges, and additions per section

**Chat Flow:**
1. From a report view, practitioner opens chat panel
2. Types a question -> POST `/api/chat` with report ID and question
3. API route loads full report from DB, includes as context in Claude system prompt
4. Streams response back to client via Server-Sent Events
5. Chat history maintained in client state (not persisted to DB — see D-11)

**Correction Flow:**
1. From report view, practitioner clicks "Correct" on a specific section
2. A correction form appears showing the original AI text and a field for corrected text + reasoning notes
3. Practitioner submits -> POST `/api/reports/[id]/corrections`
4. Correction is stored in `report_corrections` table with section key, original content, corrected content, and notes
5. Future analyses for this patient will include these corrections in the prompt context (via `lib/claude/context.ts`)

## Implementation Plan

### Phase 1: Project Setup & Infrastructure
1. Initialize Next.js 14 project with TypeScript and App Router
2. Install and configure Tailwind CSS
3. Initialize shadcn/ui and install required components
4. Set up Supabase project (create database, configure auth)
5. Create database tables and RLS policies via Supabase SQL editor
6. Configure environment variables (.env.local with Supabase URL, anon key, Anthropic API key)
7. Set up Supabase client utilities (browser + server)
8. Set up Next.js middleware for auth-protected routes
9. Install Anthropic SDK

### Phase 2: Authentication & Layout
10. Build login page with Supabase email/password auth
11. Build root layout with sidebar navigation and header
12. Create protected route wrapper
13. Build dashboard page with recent patients and sessions summary

### Phase 3: Patient Management
14. Define Zod validation schemas for patient data
15. Build patient list page with search functionality
16. Build patient creation form
17. Build patient detail page (view + session history)
18. Build patient edit form
19. Create patient API routes (CRUD)

### Phase 4: Claude API Integration
20. Create Anthropic SDK client wrapper
21. Define all system prompts in `lib/claude/prompts.ts` (including image quality detection, structural extraction, and correction context blocks)
22. Implement prior findings + corrections context builder (`lib/claude/context.ts`)
23. Implement standard analysis function with image handling and context injection
24. Implement comparison analysis function
25. Implement technical review function
26. Implement chat function with streaming
27. Define report types and Zod schemas for Claude response validation

### Phase 5: Session & Analysis
28. Build session creation form (mode selector, image upload, data input)
29. Build image upload component with drag-and-drop and preview
30. Build analysis mode selector component
31. Create session API routes
32. Create analysis API route (POST /api/analyze) with SSE streaming status updates
33. Create comparison API route (POST /api/compare) with image count validation (exactly 4)
34. Create technical review API route (POST /api/review)
35. Build analysis loading/progress UI (SSE-driven status display)

### Phase 6: Report Display, Editing & Corrections
36. Build Markdown renderer component
37. Build report viewer with collapsible sections
38. Build single report section component (with image quality warning indicators)
39. Build report editor with per-section Markdown editing (textarea + live preview)
40. Build section correction component (flag/annotate corrections with reasoning)
41. Create report API routes (GET, PUT)
42. Create corrections API routes (GET, POST for `/api/reports/[id]/corrections`)
43. Build report print/export styling (CSS print media query)

### Phase 7: Chat Interface
44. Build chat UI component (message list + input)
45. Create chat API route with streaming (SSE)
46. Integrate chat panel into report view page

### Phase 8: Polish & Deployment
47. Add loading states and skeleton screens across all pages
48. Add error handling and toast notifications
49. Add responsive design adjustments for tablet
50. Configure Railway deployment (Dockerfile or nixpack)
51. Set environment variables in Railway dashboard
52. Configure custom domain (optional)
53. End-to-end testing of all flows

## Testing Plan

### Testing Structure
- Unit testing: Vitest (fast, TypeScript-native, compatible with Next.js)
- Integration testing: Vitest + Testing Library (component + API route testing)
- End-to-end testing: Playwright (browser automation for full flows)

### Automated Testing Mechanism
- `npm run test` executes Vitest unit and integration tests
- `npm run test:e2e` executes Playwright end-to-end tests
- Tests run on pre-commit via Husky + lint-staged (unit tests only for speed)
- Full test suite runs in CI (GitHub Actions) on push to main branch

### Log Access
- Development: `npm run dev` outputs to terminal with Next.js built-in logging
- Production (Railway): Railway dashboard provides log streaming and historical logs
- Supabase: Dashboard provides database query logs and auth event logs
- Claude API: Response metadata logged server-side for debugging (token usage, latency)

### Test Cases

| Acceptance Criterion | Unit Tests | Integration Tests | E2E Tests |
|---|---|---|---|
| AC-1: Upload iris images and receive 11-section report | Validate image base64 encoding, validate report JSON parsing | API route processes images and returns structured response (mocked Claude) | Full flow: upload images -> wait for analysis -> view report |
| AC-2: Report follows fixed 11-section structure | Zod schema validation for all 11 sections, report type constants | Report viewer renders all 11 sections in correct order | Visual check: report displays all sections with correct Spanish headings (report content in Spanish, UI chrome in English) |
| AC-3: Comparison Mode with old + new images | Comparison prompt includes 4 image slots, validate comparison response format | Compare API route handles 4 images correctly (mocked Claude) | Full flow: upload 4 images -> comparison report with directional indicators |
| AC-4: Technical Review Mode | Review prompt includes practitioner interpretation, validate review response | Review API route handles text + images (mocked Claude) | Full flow: enter interpretation + images -> receive validation/challenges |
| AC-5: Patient records stored and retrievable | Zod validation for patient create/update, data transformation functions | Patient API routes: create, read, update, delete operations against Supabase | Create patient -> view in list -> view detail -> edit -> verify changes |
| AC-6: Reports editable and saveable | Report editor state management, section-level edit detection | Report PUT API saves edited content, returns updated report | Edit section -> save -> reload page -> verify changes persisted |
| AC-7: Chat interface for report Q&A | Chat message formatting, chat state management | Chat API route streams response with report context (mocked Claude) | Open chat -> ask question -> receive contextual streaming answer |
| AC-8: Images NOT stored in database | Verify no storage calls in analysis functions | API routes do not write image data to Supabase | Check Supabase dashboard after analysis: no image data in any table |
| AC-9: Deploy on Railway + Supabase | Environment variable validation, Supabase client initialization | Health check endpoint responds correctly | Application accessible via Railway URL, login works, full analysis flow |
| AC-10: Authentication via Supabase Auth | Auth middleware redirects unauthenticated requests | Login flow: submit credentials -> receive session -> access protected route | Login -> navigate protected pages -> logout -> verify redirect |
| AC-11: Reports follow iridology rules | Prompt templates include all interpretation rules, structural extraction instructions, image quality rules | Analysis responses checked for prohibited patterns (color descriptions, decorative language) | Expert review of generated reports for clinical quality |
| AC-12: Image quality detection and uncertainty flagging | Prompt includes image quality assessment block, Zod schema validates quality flag fields | Submit blurry/glare test images (mocked Claude) -> response includes uncertainty flags in affected sections | Upload a deliberately poor-quality image -> verify report sections show uncertainty warnings, not fabricated findings |
| AC-13: Practitioner corrections stored | Correction Zod schema validates section key + content, correction form state management | POST correction -> verify stored in DB, GET corrections -> verify returned for report | Flag a section as corrected -> save -> reload -> verify correction displayed, run new analysis -> verify correction context injected |
| AC-14: Inter-report consistency | Context builder includes prior report summary, prompt includes prior findings block | Create two sequential sessions for same patient (mocked Claude) -> verify second prompt includes first report summary | Generate report -> generate second report for same patient -> verify second report references prior findings and maintains consistency |

## Phases

### Phase 1: Project Setup & Infrastructure
- [ ] Task #1: Initialize Next.js 14 with TypeScript, Tailwind, shadcn/ui, Supabase, and testing frameworks
  - Can run in parallel with: (none — foundation phase)
  - Subtasks:
    - [ ] Initialize Next.js 14 project with TypeScript
    - [ ] Configure Tailwind CSS
    - [ ] Initialize shadcn/ui and install components
    - [ ] Create Supabase project and configure database
    - [ ] Execute database schema SQL
    - [ ] Create .env.example and .env.local
    - [ ] Implement Supabase client utilities
    - [ ] Implement Next.js middleware for auth
    - [ ] Install Anthropic SDK
    - [ ] Set up Vitest, Testing Library, Playwright
    - [ ] Create TypeScript types

### Phase 2: Authentication & Layout
- [ ] Task #2: Build authentication system and core layout components
  - Depends on: Task #1
  - Can run in parallel with: (none)
  - Subtasks:
    - [ ] Build login page with email/password form
    - [ ] Build root layout with fonts and providers
    - [ ] Build sidebar component with navigation
    - [ ] Build header component with user menu
    - [ ] Build dashboard page with summaries
    - [ ] Write auth and layout tests

### Phase 3: Patient Management
- [ ] Task #3: Implement patient CRUD operations and UI
  - Depends on: Task #2
  - Can run in parallel with: (none)
  - Subtasks:
    - [ ] Define Zod schemas for patient validation
    - [ ] Implement patient API routes
    - [ ] Build patient list page with search
    - [ ] Build patient form component
    - [ ] Build new patient page
    - [ ] Build patient detail page
    - [ ] Build patient edit page
    - [ ] Write CRUD and form tests

### Phase 4: Claude API Integration
- [ ] Task #4: Implement Claude analysis engine with all modes
  - Depends on: Task #1
  - Can run in parallel with: Task #2, Task #3
  - Subtasks:
    - [ ] Implement Anthropic client wrapper
    - [ ] Define system prompts (standard/comparison/review/chat)
    - [ ] Implement prior findings context builder
    - [ ] Implement standard analysis function
    - [ ] Implement comparison function
    - [ ] Implement technical review function
    - [ ] Implement chat function
    - [ ] Define Zod schemas for validation
    - [ ] Write prompt and parsing tests

### Phase 5: Session & Analysis
- [ ] Task #5: Build session creation and analysis workflow
  - Depends on: Task #2, Task #4
  - Can run in parallel with: (none)
  - Subtasks:
    - [ ] Build image upload component
    - [ ] Build mode selector component
    - [ ] Build session form component
    - [ ] Build new session page
    - [ ] Define session validation schemas
    - [ ] Implement session API routes
    - [ ] Implement analysis API routes (all modes)
    - [ ] Build image quality warning component
    - [ ] Build analysis progress UI
    - [ ] Build session detail page
    - [ ] Write image upload and analysis tests

### Phase 6: Report Display, Editing & Corrections
- [ ] Task #6: Implement report display, editing, and correction features
  - Depends on: Task #5
  - Can run in parallel with: (none)
  - Subtasks:
    - [ ] Build Markdown renderer component
    - [ ] Build report section component
    - [ ] Build report viewer with 11 sections
    - [ ] Build report view page
    - [ ] Build report editor with preview
    - [ ] Build report edit page
    - [ ] Build section correction component
    - [ ] Implement report API routes
    - [ ] Implement corrections API routes
    - [ ] Add print styles
    - [ ] Write rendering and correction tests

### Phase 7: Chat Interface
- [ ] Task #7: Build chat interface for report discussion
  - Depends on: Task #6
  - Can run in parallel with: (none)
  - Subtasks:
    - [ ] Build chat message component
    - [ ] Build chat message list
    - [ ] Build chat UI with streaming
    - [ ] Implement chat API route
    - [ ] Build chat page integrated with report
    - [ ] Write message and streaming tests

### Phase 8: Polish & Deployment
- [ ] Task #8: Add final polish and deploy to production
  - Depends on: Task #7
  - Can run in parallel with: (none)
  - Subtasks:
    - [ ] Add loading skeletons
    - [ ] Add toast notifications
    - [ ] Add error boundary
    - [ ] Test responsive layout
    - [ ] Configure Railway deployment
    - [ ] Deploy to Railway
    - [ ] Run Playwright E2E suite
    - [ ] Final acceptance criteria review
