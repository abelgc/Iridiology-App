'use client'

import { Suspense } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { UploadTutorial } from '@/components/client/upload-tutorial'
import { IrisImageUpload } from '@/components/client/iris-image-upload'
import { AnalysisSplash } from '@/components/client/analysis-splash'
import { PreAnalysisVideo } from '@/components/client/pre-analysis-video'

function ProgressBar() {
  const { t } = useLanguage()
  const steps = [
    { label: t('uploadProgress0'), state: 'done' },
    { label: t('uploadProgress1'), state: 'done' },
    { label: t('uploadProgress2'), state: 'active' },
  ] as const

  return (
    <div className="upload-progress-bar">
      <div className="upload-progress-inner">
        {steps.map((step, i) => (
          <div key={step.label} className="upload-progress-step">
            <div className={`upload-progress-dot ${step.state}`}>
              {step.state === 'done' ? '✓' : String(i + 1)}
            </div>
            <span className={`upload-progress-label ${step.state === 'active' ? 'active' : ''}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type Stage = 'form' | 'video' | 'analyzing'

// `stage` and the in-flight-upload ref live purely in memory, so a reload (lost wifi, stray
// refresh, closed tab) used to reset the client to the upload form while their analysis kept
// running server-side. Persist just enough to resume, keyed by token so a *different* analysis
// in the same tab can never inherit stale state.
const FLOW_STORAGE_PREFIX = 'client-upload-flow:'

// sessionStorage throws outright in some private-browsing modes. Persistence here is a bonus,
// never a precondition — an exception must never take down the page.
function readPersistedStage(token: string): Stage | null {
  try {
    const raw = window.sessionStorage.getItem(`${FLOW_STORAGE_PREFIX}${token}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token?: string; stage?: string }
    if (parsed?.token !== token) return null
    return parsed.stage === 'video' || parsed.stage === 'analyzing' ? parsed.stage : null
  } catch {
    return null
  }
}

function persistStage(token: string, stage: Stage) {
  try {
    const key = `${FLOW_STORAGE_PREFIX}${token}`
    if (stage === 'form') window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, JSON.stringify({ token, stage }))
  } catch {
    // no-op
  }
}

// The upload route answers 409 { error: 'already_processing' } when the row has already moved
// past 'paid' — a duplicate submit, or a client who lost their page and re-uploaded.
async function isAlreadyProcessing(res: Response): Promise<boolean> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error === 'already_processing'
}

// Row statuses that mean the upload POST really did land and stage 1 claimed the row (or the
// pipeline has already run to a verdict). The only other statuses the report route can report
// are 'paid' and 'intake_pending', both of which mean no analysis was ever started.
const ANALYSIS_UNDER_WAY = new Set(['analyzing', 'stage2_processing', 'completed', 'failed'])

type ResumeVerdict = 'started' | 'not-started' | 'unknown'

// A request that hangs rather than fails (dead wifi, captive portal) would otherwise hold the
// splash up with nothing left to break it. Give up well inside a client's patience and fall
// back to the form — a few seconds of "checking" is fine, a frozen screen is not.
const RESUME_CHECK_TIMEOUT_MS = 8000

// Persistence happens the moment the upload POST is *dispatched*, so there is a
// millisecond-wide window in which the browser can die before the request ever leaves the
// machine: state persisted, row still 'paid', nothing running. Resuming blindly parks that
// client on the report page, which polls a row that will never move and calls it a failure
// ~6 minutes later. So ask the server what actually happened before committing.
//
// GET /api/client/reports/{token} is the existing read: 200 once the report is ready,
// 409 { status } otherwise. It is side-effect-free for a 'paid' row, so using it as a probe
// cannot itself advance or damage the analysis.
async function checkAnalysisStarted(token: string, signal: AbortSignal): Promise<ResumeVerdict> {
  try {
    const res = await fetch(`/api/client/reports/${token}`, { signal, cache: 'no-store' })
    if (res.ok) return 'started' // the report is finished and readable
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { status?: string } | null
      if (!body?.status) return 'unknown'
      return ANALYSIS_UNDER_WAY.has(body.status) ? 'started' : 'not-started'
    }
    // 400 invalid_token, 404 not_found, 5xx — we genuinely cannot tell from here.
    return 'unknown'
  } catch {
    // Offline, DNS failure, aborted. Never let this throw into the effect: an unhandled
    // rejection would leave the splash up with nothing left to move it.
    return 'unknown'
  }
}

function UploadContent() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  // Resume after a reload. Anything persisted means the upload POST was *dispatched* — which
  // is a weaker claim than "the analysis is running", so this only decides that a resume is
  // worth investigating. Hold the splash while the effect below asks the server what actually
  // happened; it then either hands off to the report page or returns to the form.
  //
  // Read during the first render rather than in an effect: this subtree calls useSearchParams
  // inside a <Suspense> boundary, so Next renders it client-side only (never prerendered) and
  // a first-render sessionStorage read cannot cause a hydration mismatch. The read stays
  // synchronous for exactly that reason — the async part belongs in the effect, not in render.
  // Read after mount, never during render. An earlier version read sessionStorage in a
  // lazy useState initialiser, reasoning that useSearchParams inside <Suspense> makes this
  // subtree client-only and therefore safe. It is not: the browser end-to-end test caught
  // "Hydration failed because the server rendered HTML didn't match the client" on a real
  // reload. sessionStorage does not exist on the server, so any render that depends on it
  // is a mismatch by construction. The cost is one frame of the form before the splash
  // takes over, which is invisible next to a hydration error that throws away the tree.
  const [resumedToken, setResumedToken] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('form')
  const pendingUpload = useRef<Promise<Response> | null>(null)

  useEffect(() => {
    if (!token) {
      router.replace('/client')
    }
  }, [token, router])

  // Guarded to run once per mount. Left on [token, router] it re-ran whenever the router
  // identity changed, and by then handleSubmit had already persisted 'video' — so it read
  // its own write back, decided this was a resume, and jumped straight to the analysing
  // splash, skipping the waiting video entirely. "Did this page load as a resume?" is a
  // question with one answer per mount; asking it again later answers a different question.
  const resumeChecked = useRef(false)
  // sessionStorage does not exist on the server, so deciding what to render from it during
  // render is a hydration mismatch by construction — proven by the browser test, which
  // caught exactly that. Changing the view from client-only storage necessarily means one
  // setState after mount; the ref guard above keeps it to a single extra render.
  useEffect(() => {
    if (!token || resumeChecked.current) return
    resumeChecked.current = true
    if (readPersistedStage(token)) {
      /* eslint-disable react-hooks/set-state-in-effect -- see the note above: reading this
         during render is a hydration mismatch, so a post-mount setState is the only correct
         shape. The ref guard makes it one extra render, not a cascade. */
      setResumedToken(token)
      setStage('analyzing')
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [token])

  useEffect(() => {
    if (!resumedToken) return
    let cancelled = false
    const controller = new AbortController()
    const giveUp = setTimeout(() => controller.abort(), RESUME_CHECK_TIMEOUT_MS)
    void (async () => {
      const verdict = await checkAnalysisStarted(resumedToken, controller.signal)
      clearTimeout(giveUp)
      if (cancelled) return
      if (verdict === 'started') {
        router.replace(`/client/report/${resumedToken}`)
        return
      }
      // Either nothing was ever started for this token, or we couldn't find out. Both land
      // on the form: re-submitting an analysis that IS running comes back 409
      // already_processing, which handleVideoContinue already turns into a redirect to the
      // report — so a wrong guess here self-heals. The opposite wrong guess (parking a
      // never-started client on the report page) has no recovery at all.
      //
      // Only clear the persisted entry when the server actually told us nothing started.
      // On 'unknown' we learned nothing, so leave it: a later reload on a working connection
      // still deserves the chance to resume properly.
      if (verdict === 'not-started') persistStage(resumedToken, 'form')
      setStage('form')
    })()
    return () => {
      cancelled = true
      clearTimeout(giveUp)
      controller.abort()
    }
  }, [resumedToken, router])

  function handleSubmit({ right, left }: { right: string; left: string }) {
    if (!token) return
    pendingUpload.current = fetch('/api/client/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        report_download_token: token,
        right_eye_base64: right,
        left_eye_base64: left,
      }),
    })
    // Persist the moment the POST is dispatched, so a reload from here on resumes.
    persistStage(token, 'video')
    setStage('video')
  }

  async function handleVideoContinue() {
    const pending = pendingUpload.current
    if (!pending || !token) return
    persistStage(token, 'analyzing')
    setStage('analyzing')
    try {
      const res = await pending
      if (res.status === 413) {
        persistStage(token, 'form')
        setStage('form')
        alert(t('errorPayloadTooLarge'))
        return
      }
      // "Already under way" is forward progress, not failure: the analysis this client paid
      // for is running (or already finished). Send them to the report, where the polling view
      // shows progress and then the report itself — never back to the form with an error.
      if (res.status === 409 && (await isAlreadyProcessing(res))) {
        router.replace(`/client/report/${token}`)
        return
      }
      if (!res.ok) {
        persistStage(token, 'form')
        setStage('form')
        alert(t('error'))
        return
      }
      // Keep the splash up through navigation — it unmounts when the report loads.
      router.replace(`/client/report/${token}`)
    } catch {
      persistStage(token, 'form')
      setStage('form')
      alert(t('error'))
    }
  }

  if (!token) return null
  return (
    <>
      {stage === 'video' && <PreAnalysisVideo onContinue={handleVideoContinue} />}
      {stage === 'analyzing' && <AnalysisSplash />}
      <ProgressBar />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 56px' }}>
        <p className="upload-tag">{t('uploadTag')}</p>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 'clamp(28px, 5vw, 40px)',
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: '#3d4a2a',
          marginBottom: 8,
        }}>
          {t('uploadTitle')}
        </h1>
        <p style={{
          color: '#5d4f3f',
          fontSize: 15,
          lineHeight: 1.55,
          marginBottom: 26,
          maxWidth: 600,
        }}>
          {t('uploadLead')}
        </p>

        <div className="upload-card">
          <UploadTutorial />
          <IrisImageUpload onSubmit={handleSubmit} />
        </div>
      </main>
    </>
  )
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadContent />
    </Suspense>
  )
}
