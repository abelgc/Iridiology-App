# Responsive Action Plan

---

## Executive Summary

The iridology application is currently built as a desktop-first layout that is functionally broken on mobile devices. The root cause is a fixed sidebar architecture: a 256px wide sidebar with `fixed` CSS positioning is unconditionally applied across all authenticated pages, and both the header and main content area are hard-coded to assume the sidebar is always present and always 256px wide. On any screen narrower than approximately 768px, this combination pushes content off-screen, hides the navigation behind content, and renders the application unusable without significant horizontal scrolling.

Beyond the structural layout failure, four secondary categories of issues compound the mobile experience. First, interactive components including buttons, inputs, and form controls have tap targets well below the 44px WCAG minimum (most default to 32px), making the application difficult to operate accurately on touchscreens. Second, several core user workflows — including the patient list, session creation form, and report editing interface — use table layouts or multi-column grids with no mobile fallback, requiring horizontal scrolling to access all content. Third, a critical UX issue exists in the image upload flow: the primary interaction is drag-and-drop, which is not a native mobile gesture, and the UI copy instructs users to drag and drop rather than tap to browse. Fourth, smaller polish issues including non-responsive font sizes, fixed-height containers, and missing HTML autocomplete attributes further degrade the mobile experience.

The risk of not addressing these issues is significant. Any mobile user attempting to navigate the application will encounter the sidebar immediately: the fixed sidebar consumes the majority of the viewport and has no dismiss or toggle mechanism, so patients cannot view their records, clinicians cannot create sessions, and no report workflow can proceed. The application is not merely suboptimal on mobile — it is non-functional for its core workflows on screens smaller than approximately 900px.

The recommended approach is a three-phase delivery. Phase 1 addresses the structural layout issues (sidebar, header, main content margin) that block 100% of mobile usage — no other fix is meaningful until these are resolved. Phase 2 addresses the high-priority interaction issues that make core workflows painful: table layouts, form usability, touch targets on primary controls, and the image upload UX. Phase 3 addresses medium-severity polish items that degrade experience quality but do not block any workflow. This plan does not include a full design overhaul; it targets the minimum changes required to make all documented user journeys operable on mobile devices.

A note on scope: this document covers all 27 unique issues identified across four audits. Several issues were flagged by multiple auditors; those have been merged into single canonical entries with the most precise file and line reference retained.

---

## Severity Matrix

| # | Issue | File | Line(s) | Severity | Effort |
|---|-------|------|---------|----------|--------|
| 1 | Sidebar fixed at w-64 with no mobile collapse, hamburger, or drawer | `src/components/layout/sidebar.tsx` | 20 | Critical | L |
| 2 | Header fixed with hardcoded `left-64` offset, no responsive adjustment | `src/components/layout/header.tsx` | 42 | Critical | M |
| 3 | Main content hard-coded `ml-64` margin, shifts all content off-screen on mobile | `src/app/(app)/layout.tsx` | 12 | Critical | M |
| 4 | Patient list table (5 columns) forces horizontal scroll on mobile, no card fallback | `src/components/patients/patient-list.tsx` | 22–56 | High | L |
| 5 | Session form (8+ card sections) unusably long on mobile, image upload not touch-native | `src/components/sessions/session-form.tsx` | 215–439 | High | L |
| 6 | Image upload drag-and-drop is primary interaction; mobile users cannot use it; copy says "Drag and drop" | `src/components/sessions/image-upload.tsx` | 87 | High | M |
| 7 | Session detail grid uses `grid-cols-2` unconditionally, no mobile single-column | `src/app/(app)/sessions/[id]/page.tsx` | 199 | High | S |
| 8 | Report editor two-column grid (`lg:grid-cols-2`) pushes editor below fold on mobile | `src/components/reports/report-editor.tsx` | 53 | High | M |
| 9 | Patient detail sessions grid uses `md:grid-cols-2`, missing mobile breakpoints | `src/app/(app)/patients/[id]/page.tsx` | 60 | High | S |
| 10 | Chat container fixed `h-96` does not adapt to mobile viewport height | `src/app/(app)/reports/[id]/chat/page.tsx` | 133 | High | S |
| 11 | Button default height `h-8` (32px), below 44px touch target minimum | `src/components/ui/button.tsx` | — | High | M |
| 12 | Input default height `h-8` (32px), below 44px touch target minimum | `src/components/ui/input.tsx` | — | High | M |
| 13 | No back navigation or breadcrumbs on any app page; users trapped with only sidebar | `src/app/(app)/` (all pages) | — | High | L |
| 14 | Correction modal `max-h-96` may exceed viewport height; nested scroll on mobile | `src/components/reports/section-correction.tsx` | 67 | High | M |
| 15 | Markdown renderer tables have no `overflow-x-auto` wrapper; overflow on narrow screens | `src/components/shared/markdown-renderer.tsx` | 38 | Medium | S |
| 16 | ReportChat `max-h-screen` does not account for mobile keyboard presence | `src/components/reports/report-chat.tsx` | 114 | Medium | M |
| 17 | Chat message max-width `max-w-xs` (320px) causes excessive wrapping on 280px screens | `src/components/reports/chat-message.tsx` | 18 | Medium | S |
| 18 | Dialog close button `absolute top-2 right-2` using `size="icon-sm"`, very small tap target | `src/components/ui/dialog.tsx` | 56 | Medium | S |
| 19 | Sheet close button `size="icon-sm"`, width `w-3/4` on 320px = 240px; cramped | `src/components/ui/sheet.tsx` | 56 | Medium | S |
| 20 | Report viewer language toggle buttons ~27px tall, well below 44px tap target | `src/components/reports/report-viewer.tsx` | 82–104 | Medium | S |
| 21 | ModeSelector custom radio buttons `w-5 h-5`, below 44px; description not hidden on small screens | `src/components/sessions/mode-selector.tsx` | 30–64 | Medium | S |
| 22 | Report section uses only `hover:bg-gray-50`; no touch feedback on mobile | `src/components/reports/report-section.tsx` | 31 | Medium | S |
| 23 | Markdown renderer headings use fixed font sizes (`text-2xl` etc.) without responsive variants | `src/components/shared/markdown-renderer.tsx` | 18–21 | Medium | S |
| 24 | Phone input missing `type="tel"` attribute; mobile keyboard shows QWERTY instead of numpad | `src/components/patients/patient-form.tsx` | — | Medium | S |
| 25 | Login page missing `autocomplete="email"` and `autocomplete="current-password"` | `src/app/login/page.tsx` | 60 | Medium | S |
| 26 | Image preview fixed `h-48` (192px), excessive on mobile; no responsive height | `src/components/sessions/image-upload.tsx` | 87 | Low | S |
| 27 | Session form spacing `space-y-6` excessive on mobile; should scale down | `src/components/sessions/session-form.tsx` | 215 | Low | S |
| 28 | Report section header text `text-lg` not responsive | `src/components/reports/report-section.tsx` | 36 | Low | S |
| 29 | Provider form `max-w-lg` without responsive padding | `src/components/settings/provider-form.tsx` | 65 | Low | S |
| 30 | Login card `max-w-sm` with `p-8` leaves only ~256px content width on 320px phone | `src/app/login/page.tsx` | 60 | Low | S |
| 31 | Toaster full-width on mobile (only `md:max-w-[420px]`) | `src/components/ui/toaster.tsx` | 11 | Low | S |
| 32 | Chat send button icon-only; no text fallback; unclear affordance on mobile | `src/components/reports/report-chat.tsx` | 158–160 | Low | S |
| 33 | Print button `size="sm"` (h-7, 28px) below 44px tap target | `src/components/reports/report-viewer.tsx` | — | Low | S |

---

## Per-File Fix Plan

### `src/app/(app)/layout.tsx`
**Lines 10–14**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Main content `ml-64` is unconditional; sidebar always assumed visible | Replace `ml-64` with `md:ml-64`; add `ml-0` as default. Add a mobile overlay trigger state to show/hide sidebar as a drawer. This fix must be coordinated with sidebar.tsx and header.tsx changes. | Critical | M |

---

### `src/components/layout/sidebar.tsx`
**Line 20**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Fixed `w-64` sidebar never collapses or hides on mobile; no hamburger or drawer mechanism | Convert sidebar to a responsive drawer pattern. On `md:` and above, retain current fixed sidebar. Below `md:`, hide the sidebar off-screen (`-translate-x-full`) and expose a hamburger toggle in the header. Add an overlay backdrop to dismiss. Requires state management (context or Zustand) to wire toggle across layout, header, and sidebar. | Critical | L |

---

### `src/components/layout/header.tsx`
**Line 42**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| `fixed top-0 left-64 right-0` hardcodes 256px offset; no responsive adjustment | Change to `left-0 md:left-64` so header spans full width on mobile. Add a hamburger menu button (visible only on `< md`) that triggers sidebar open state. | Critical | M |

---

### `src/components/patients/patient-list.tsx`
**Lines 22–56**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| 5-column table with `whitespace-nowrap` forces horizontal scroll; no card fallback for mobile | Implement responsive table strategy: either wrap the table in `overflow-x-auto` as a minimum fix, or implement a card-per-row layout that renders on `sm:` and below while table renders on `md:` and above. Card view is the correct UX solution; overflow-x-auto is an acceptable interim. | High | L |

---

### `src/components/sessions/session-form.tsx`
**Lines 215–439**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| 8+ card sections stacked with no collapsible approach; `max-w-2xl` without responsive padding | Reduce `space-y-6` to `space-y-3 md:space-y-6` for mobile. Review padding on card sections. Sections should not require horizontal scrolling. | High | L |
| `space-y-6` excessive on mobile | Change to `space-y-3 md:space-y-6` | Low | S |
| Plain `<select>` for patient selector not styled for touch | Ensure the select element has sufficient height (min 44px) and uses a styled select or combobox component. | High (part of overall form fix) | — |

---

### `src/components/sessions/image-upload.tsx`
**Line 87**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Drag-and-drop primary interaction not usable on mobile; copy says "Drag and drop" | Detect touch capability or use `ontouchstart` / `pointer: coarse` media query. On mobile, change copy to "Tap to browse your photos". Ensure the `<input type="file">` click handler works correctly on iOS Safari (which has restrictions on programmatic file input triggering). Remove DnD event handlers on touch devices or keep them inactive. | High | M |
| Image preview `h-48` fixed height excessive on mobile | Change to `h-32 md:h-48` | Low | S |

---

### `src/app/(app)/sessions/[id]/page.tsx`
**Line 199**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| `grid grid-cols-2` unconditional two-column layout | Change to `grid grid-cols-1 sm:grid-cols-2` | High | S |

---

### `src/components/reports/report-editor.tsx`
**Lines 42–99**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| `grid-cols-1 lg:grid-cols-2` — section list full-width on mobile pushes editor below fold; textarea `h-64` fixed | Add `md:grid-cols-2` breakpoint as intermediate step. Consider collapsible section list on mobile. Textarea should use `h-48 md:h-64` or `min-h-[12rem]` with `resize-y`. | High | M |

---

### `src/app/(app)/reports/[id]/chat/page.tsx`
**Line 133**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| `h-96` fixed height chat container | Replace with `h-[calc(100vh-var(--header-height))]` or use flex layout with `flex-1` so container fills available viewport. | High | S |

---

### `src/components/ui/button.tsx`

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Default `h-8` (32px) below 44px tap target | Update default size variant to `h-11` (44px). Audit all size variants (`sm`, `lg`, `icon`) to ensure none fall below 44px or add explicit `min-h-[44px]` to all variants. | High | M |

---

### `src/components/ui/input.tsx`

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Default `h-8` (32px) below 44px tap target | Update base input to `h-11` (44px). Apply consistent with button change so form rows remain visually aligned. | High | M |

---

### `src/app/(app)/` (all pages)

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| No back navigation or breadcrumbs; mobile users have no way to navigate without sidebar | Add a breadcrumb or back-button pattern to page headers. At minimum, each `[id]` detail page should render a back button on `< md` breakpoints. This can be implemented as a shared `<MobileNav>` component added to the header on mobile. | High | L |

---

### `src/components/reports/section-correction.tsx`
**Line 67**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Modal `max-h-96` may exceed viewport height on mobile; nested scrolling | Change `max-h-96` to `max-h-[80vh]` or `max-h-[calc(100vh-4rem)]`. Ensure no nested scroll occurs by auditing parent containers. | High | M |

---

### `src/components/shared/markdown-renderer.tsx`
**Lines 18–21, 38**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Tables have no `overflow-x-auto` wrapper; wide tables overflow on narrow screens | Wrap `<table>` in `<div className="overflow-x-auto">` inside the renderer's table component override. | Medium | S |
| Headings use fixed font sizes (`text-2xl`, `text-xl`, `text-lg`) without responsive variants | Add responsive classes: `text-xl md:text-2xl`, `text-lg md:text-xl`, `text-base md:text-lg`. | Medium | S |

---

### `src/components/reports/report-chat.tsx`
**Lines 114–175**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| `max-h-screen` doesn't account for mobile keyboard (virtual keyboard shrinks viewport) | Use `max-h-[100dvh]` (dynamic viewport height) which accounts for mobile browser chrome and keyboard. | Medium | M |
| Send button icon-only; unclear on mobile | Add `sr-only` accessible label minimum; optionally show "Send" text on `xs:` screens. | Low | S |

---

### `src/components/reports/chat-message.tsx`
**Line 18**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| `max-w-xs` (320px) caps message width, causing overflow on 280px screens | Change to `max-w-[85vw] sm:max-w-xs md:max-w-md lg:max-w-lg` | Medium | S |

---

### `src/components/ui/dialog.tsx`
**Line 56**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Close button `size="icon-sm"` too small; positioned `absolute top-2 right-2` | Change close button to `size="icon"` (minimum `h-9 w-9`) and ensure position provides adequate clearance from edge. Ideally `top-3 right-3`. | Medium | S |

---

### `src/components/ui/sheet.tsx`
**Line 56**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Close button `size="icon-sm"` too small; `w-3/4` on 320px phone = 240px width | Increase close button to `size="icon"`. For the sheet width, change to `w-full sm:w-3/4 sm:max-w-sm` for left/right variants to ensure full-width on small phones. | Medium | S |

---

### `src/components/reports/report-viewer.tsx`
**Lines 82–104**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Language toggle buttons ~27px tall, below 44px tap target; `px-3 py-1.5 text-xs` | Change to `py-2.5 px-4 text-sm` minimum to achieve ~40px height, or wrap in a `min-h-[44px]` container. | Medium | S |
| Print button `size="sm"` (h-7, 28px) below 44px | Change to `size="default"` or add `className="h-11"` override. | Low | S |

---

### `src/components/sessions/mode-selector.tsx`
**Lines 30–64**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Custom radio buttons `w-5 h-5` below 44px; description text clutters small screens | Add `min-h-[44px]` to each radio option wrapper. Optionally hide description text with `hidden sm:block` if it causes layout issues on small screens. | Medium | S |

---

### `src/components/reports/report-section.tsx`
**Lines 31, 36**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| `hover:bg-gray-50` only; no touch feedback on mobile | Add `active:bg-gray-100` alongside the hover state. On touch devices `active:` fires reliably. | Medium | S |
| `text-lg` section header not responsive | Change to `text-base md:text-lg` | Low | S |

---

### `src/components/patients/patient-form.tsx`

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Phone input missing `type="tel"` | Add `type="tel"` to the phone number input field. | Medium | S |

---

### `src/app/login/page.tsx`
**Line 60**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Missing `autocomplete` attributes on email and password fields | Add `autoComplete="email"` and `autoComplete="current-password"` to respective inputs. | Medium | S |
| Login card `max-w-sm` with `p-8` leaves ~256px content on 320px phone | Change padding to `p-4 sm:p-8` and ensure `max-w-sm` has `mx-4 sm:mx-auto` so it doesn't touch screen edges. | Low | S |

---

### `src/app/(app)/patients/[id]/page.tsx`
**Line 60**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Patient info grid `md:grid-cols-2` missing mobile breakpoints; sessions table horizontal scroll | Add `sm:grid-cols-2` for the info grid. Wrap the sessions table in `overflow-x-auto` or implement card view. | High | S |

---

### `src/components/settings/provider-form.tsx`
**Line 65**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| `max-w-lg` without responsive padding | Add `px-4 sm:px-0` to the form container so content doesn't touch screen edges on mobile. | Low | S |

---

### `src/components/ui/toaster.tsx`
**Line 11**

| Issue | Fix Required | Severity | Effort |
|-------|-------------|----------|--------|
| Full-width toasts on mobile (only `md:max-w-[420px]`) | Add `mx-4 md:mx-0` to toaster container and `max-w-[calc(100vw-2rem)] md:max-w-[420px]`. Minor. | Low | S |

---

## Implementation Roadmap

### Phase 1 — Critical / Structural (Must ship before any mobile testing)

These issues render the application non-functional on mobile. No other fix produces any value until the layout shell is responsive.

| # | Issue | File | Effort | Dependency |
|---|-------|------|--------|------------|
| 1 | Convert sidebar to responsive drawer with hamburger toggle | `src/components/layout/sidebar.tsx` | L | None — start here |
| 2 | Make header responsive: `left-0 md:left-64`, add hamburger button | `src/components/layout/header.tsx` | M | After #1 (needs sidebar open state) |
| 3 | Make main content margin responsive: `ml-0 md:ml-64` | `src/app/(app)/layout.tsx` | M | After #1 and #2 (coordinates with sidebar state) |

Phase 1 total: 1L + 2M

---

### Phase 2 — High / Interaction (Enables core workflows)

These issues make core user journeys painful or partially blocked. Fix after Phase 1 is verified on device.

| # | Issue | File | Line(s) | Effort |
|---|-------|------|---------|--------|
| 4 | Patient list: add `overflow-x-auto` wrapper (interim) or implement card view (full) | `src/components/patients/patient-list.tsx` | 22–56 | L |
| 5 | Patient detail sessions table: add `overflow-x-auto` or card view | `src/app/(app)/patients/[id]/page.tsx` | 60 | S |
| 6 | Session form: responsive spacing, padding, and section layout | `src/components/sessions/session-form.tsx` | 215–439 | L |
| 7 | Image upload: detect touch, update copy to "Tap to browse", fix `type="file"` trigger on iOS | `src/components/sessions/image-upload.tsx` | 87 | M |
| 8 | Session detail grid: `grid-cols-1 sm:grid-cols-2` | `src/app/(app)/sessions/[id]/page.tsx` | 199 | S |
| 9 | Report editor: add `md:grid-cols-2`, responsive textarea height | `src/components/reports/report-editor.tsx` | 53 | M |
| 10 | Chat container: replace `h-96` with flex fill or `calc(100dvh - ...)` | `src/app/(app)/reports/[id]/chat/page.tsx` | 133 | S |
| 11 | Button: increase default to `h-11` (44px) across all variants | `src/components/ui/button.tsx` | — | M |
| 12 | Input: increase default to `h-11` (44px) | `src/components/ui/input.tsx` | — | M |
| 13 | Back navigation: add back button or breadcrumbs to `[id]` detail pages | `src/app/(app)/` (all `[id]` pages) | — | L |
| 14 | Correction modal: `max-h-96` → `max-h-[80vh]` | `src/components/reports/section-correction.tsx` | 67 | M |

Phase 2 total: 2L + 5M + 4S

---

### Phase 3 — Medium / Polish (Quality of experience)

These issues degrade the experience but do not block any complete workflow after Phases 1 and 2 are done.

| # | Issue | File | Line(s) | Effort |
|---|-------|------|---------|--------|
| 15 | Markdown tables: wrap in `overflow-x-auto` | `src/components/shared/markdown-renderer.tsx` | 38 | S |
| 16 | Markdown headings: add responsive font size variants | `src/components/shared/markdown-renderer.tsx` | 18–21 | S |
| 17 | ReportChat: `max-h-screen` → `max-h-[100dvh]` | `src/components/reports/report-chat.tsx` | 114 | M |
| 18 | Chat message max-width: use `max-w-[85vw]` at base | `src/components/reports/chat-message.tsx` | 18 | S |
| 19 | Dialog close button: increase tap target to `size="icon"` | `src/components/ui/dialog.tsx` | 56 | S |
| 20 | Sheet close button: increase tap target, full-width on small screens | `src/components/ui/sheet.tsx` | 56 | S |
| 21 | Report viewer language toggle: increase padding to ~44px height | `src/components/reports/report-viewer.tsx` | 82–104 | S |
| 22 | ModeSelector radio options: `min-h-[44px]` wrapper | `src/components/sessions/mode-selector.tsx` | 30–64 | S |
| 23 | Report section: add `active:bg-gray-100` touch feedback | `src/components/reports/report-section.tsx` | 31 | S |
| 24 | Report section header: `text-base md:text-lg` | `src/components/reports/report-section.tsx` | 36 | S |
| 25 | Phone input: add `type="tel"` | `src/components/patients/patient-form.tsx` | — | S |
| 26 | Login: add `autoComplete` attributes | `src/app/login/page.tsx` | 60 | S |
| 27 | Login card: responsive padding `p-4 sm:p-8`, margin `mx-4 sm:mx-auto` | `src/app/login/page.tsx` | 60 | S |
| 28 | Image preview: `h-32 md:h-48` | `src/components/sessions/image-upload.tsx` | 87 | S |
| 29 | Session form: `space-y-3 md:space-y-6` | `src/components/sessions/session-form.tsx` | 215 | S |
| 30 | Provider form: `px-4 sm:px-0` | `src/components/settings/provider-form.tsx` | 65 | S |
| 31 | Toaster: responsive max-width | `src/components/ui/toaster.tsx` | 11 | S |
| 32 | Chat send button: `sr-only` label or visible text | `src/components/reports/report-chat.tsx` | 158–160 | S |
| 33 | Print button: increase to `size="default"` | `src/components/reports/report-viewer.tsx` | — | S |

Phase 3 total: 1M + 18S

---

## Effort Summary

### Phase 1 — Critical / Structural

| Size | Count | Approx. Hours |
|------|-------|---------------|
| L | 1 | 4–8h |
| M | 2 | 2–8h |
| **Phase 1 Total** | **3 items** | **6–16h** |

### Phase 2 — High / Interaction

| Size | Count | Approx. Hours |
|------|-------|---------------|
| L | 2 | 8–16h |
| M | 5 | 5–20h |
| S | 4 | < 4h |
| **Phase 2 Total** | **11 items** | **13–40h** |

### Phase 3 — Medium / Polish

| Size | Count | Approx. Hours |
|------|-------|---------------|
| M | 1 | 1–4h |
| S | 18 | < 18h |
| **Phase 3 Total** | **19 items** | **< 22h** |

### Overall Project Total

| Phase | Items | Approx. Hours |
|-------|-------|---------------|
| Phase 1 | 3 | 6–16h |
| Phase 2 | 11 | 13–40h |
| Phase 3 | 19 | < 22h |
| **Total** | **33** | **~19–78h** |

The wide range reflects uncertainty in the sidebar drawer implementation (L item that could involve routing through a context provider, testing on multiple iOS/Android browsers) and the back navigation work (L item that spans all `[id]` pages). The S items are highly predictable. A realistic midpoint estimate for full delivery of all three phases is approximately 35–45 engineering hours.

---

## Go / No-Go Recommendation

**Recommendation: Go — with Phase 1 as a hard prerequisite gate.**

**Feasibility.** Making this application mobile-responsive is technically feasible. The codebase uses Tailwind CSS throughout, which already has the responsive utility classes needed. No fundamental architectural refactor is required. The sidebar drawer pattern is well-established and implementable with existing primitives in the codebase (the `Sheet` component in `src/components/ui/sheet.tsx` already implements a drawer-style overlay that could be leveraged directly). The majority of issues are straightforward Tailwind class changes.

**Minimum viable mobile scope.** To deliver a mobile experience where all core workflows are completeable (navigate, create patient, create session, upload images, view and edit reports, use chat), Phase 1 and Phase 2 must both be completed. Phase 1 alone makes the shell navigable but leaves core workflows broken. Phase 2 alone is wasted effort because users cannot navigate to any workflow without Phase 1. Phase 3 is a quality gate — the application will be functional without it, but not polished.

**Primary risk.** The sidebar toggle state must be shared across the layout, header, and sidebar components. If these are currently server components (likely in a Next.js App Router context), introducing interactive state requires a client boundary. This is the only architectural decision in the plan; the approach (React context in a client wrapper, Zustand store, or URL-based state) should be decided before beginning Phase 1 work to avoid rework.

**What will NOT be addressed after Phase 3.** This plan does not include: (1) a full redesign of the session creation flow into a mobile-native step-by-step wizard; (2) progressive web app (PWA) capabilities such as offline support or home screen install; (3) native camera integration beyond what the browser `<input type="file" accept="image/*" capture>` attribute provides; (4) responsive data visualization if charts or graph components are added in future; (5) automated mobile regression testing (this plan produces no tests). These are out of scope and would require separate planning efforts.

**Gate condition.** Do not begin Phase 2 work until Phase 1 has been verified on a physical iOS device (Safari) and an Android device (Chrome). The sidebar toggle, header offset, and content margin must all function correctly before any other investment is made.
