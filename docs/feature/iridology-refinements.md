# Iridology App Refinements

## Requirements

### Functional
- Post-report chat must produce visible AI responses when the user sends a follow-up message
- The iridology analysis system prompt must enforce clinically precise severity calibration, distinguishing functional dysregulation from structural depletion
- The new system prompt must use the exact section list: General Terrain, Emotional Field, Cognitive & Nervous System, Immune & Lymphatic System, Endocrine & Hormonal System, Circulatory & Cardiorespiratory System, Hepatic System, Digestive & Intestinal System, Renal & Urinary System, Structural & Integumentary System, Detected Axes, Conclusion

### Non-Functional
- Chat streaming latency must remain comparable to current behavior (no regression)
- Existing report generation, comparison, and review flows must not be affected
- Existing unit and e2e tests must continue to pass

## Acceptance Criteria
- AC-1: After a report is generated, sending a chat message produces a streamed AI response that is visible in the UI
- AC-2: The standard analysis system prompt contains all 10 mandatory clinical rules (functional vs structural, color interpretation, nervous system, liver, immune, fatigue, severity calibration, bias correction, supplement context)
- AC-3: The standard analysis prompt output sections match the required list (General Terrain through Conclusion)
- AC-4: All existing unit tests updated and passing; new tests cover the chat bug fix and prompt changes

## Decision Log

| Decision | Type | Rationale | Alternatives Considered |
|---|---|---|---|
| Fix chat by inserting empty assistant message before streaming | Implementation | The root cause is that `report-chat.tsx` never adds an assistant message to the array before streaming begins, so the update check `lastMessage.role === 'assistant'` always fails silently. Inserting a placeholder message is the minimal correct fix. | (a) Rewrite to always append new message on first token -- more complex, same result. (b) Use a separate state variable for streaming content -- unnecessary additional state. |
| Replace system prompt content in existing `prompts.ts` constants | Implementation | The prompt infrastructure (template functions, provider abstraction) is well-designed. Only the prompt text content needs to change, not the architecture. | (a) Create a separate prompts config file -- over-engineering for a content change. |
| Update report section keys and labels to match new prompt | Implementation | The new prompt uses a different section list (drops sections 12-14, adds Conclusion). `REPORT_SECTION_KEYS` in `src/types/report.ts` and `REPORT_SECTION_LABELS` must be updated to match, along with the `reportContentSchema` validator. | (a) Keep old sections and add Conclusion -- inconsistent with new prompt requirements. |

## System Design

**Issue 1 -- Chat streaming bug:**
- File: `src/components/reports/report-chat.tsx` (lines 28-105)
- Root cause: The `handleSend` function adds a user message to state (line 37), then starts reading SSE tokens. It accumulates tokens into `assistantContent` and tries to update the last message in state if `lastMessage.role === 'assistant'` (line 79). However, no assistant message is ever pushed into the `messages` array before streaming begins. The last message is always the user's message, so the role check fails and every token is silently dropped.
- Fix: After adding the user message and before starting the fetch, push an initial `{ role: 'assistant', content: '' }` message into state. The streaming update logic will then find it and update its content correctly.

**Issue 2 -- System prompt replacement:**
- File: `src/lib/claude/prompts.ts` -- the `STANDARD_ANALYSIS_SYSTEM_PROMPT` constant (lines 1-45) will be replaced with the new clinically precise prompt text provided in the requirements
- The output section JSON keys change: sections 12 (Ayurvedic), 13 (Treatment Protocol), and 14 (Food Recommendations) are dropped; a new section 12 (`section_12_conclusion`) replaces them. This requires updates to `src/types/report.ts` (`REPORT_SECTION_KEYS`, `REPORT_SECTION_LABELS`) and `src/lib/validators/report.ts`
- The chat system prompt template (`CHAT_SYSTEM_PROMPT_TEMPLATE`) does not need structural changes -- it receives report content dynamically

**Technical finding -- section key change impact:**
- The `report_content` JSONB column in the `reports` table stores section keys. Report display components iterate over `REPORT_SECTION_KEYS` from `src/types/report.ts`, so they will automatically adapt to the new key set. The existing prompts test file (`src/lib/claude/__tests__/prompts.test.ts`) checks for Spanish-language strings from the old prompt (e.g., `CALIDAD DE IMAGEN`). These tests must be rewritten to validate the new English prompt content and the new section keys.

## Implementation Plan

1. **Fix chat streaming bug** in `src/components/reports/report-chat.tsx`:
   - In `handleSend`, after `setMessages(prev => [...prev, userMessage])`, add `setMessages(prev => [...prev, { role: 'assistant', content: '' }])` before the fetch call
   - Verify the streaming update logic correctly targets the new assistant message

2. **Update report section types** in `src/types/report.ts`:
   - Replace 14-key `REPORT_SECTION_KEYS` with new 12-key array (sections 1-11 + `section_12_conclusion`)
   - Update `REPORT_SECTION_LABELS` to match
   - Verify or update `reportContentSchema` in `src/lib/validators/report.ts`

3. **Replace standard analysis prompt** in `src/lib/claude/prompts.ts`:
   - Replace `STANDARD_ANALYSIS_SYSTEM_PROMPT` with the new clinically precise prompt
   - Update the JSON response format to use the new 12-key section structure

4. **Update tests**:
   - Rewrite `src/lib/claude/__tests__/prompts.test.ts` to validate new prompt content and section keys
   - Add unit test for the chat streaming fix (assistant message placeholder insertion)
   - Verify e2e tests still pass

## Testing Plan

### Testing Structure
- Unit testing: Vitest with `@testing-library/react` and `@testing-library/jest-dom`; tests colocated in `__tests__/` directories alongside source files
- Integration testing: Vitest (same framework, API route and data flow tests)
- End-to-end testing: Playwright; test files in `e2e/` directory (`auth.spec.ts`, `responsive.spec.ts`, `patient-management.spec.ts`, `analysis.spec.ts`)

### Automated Testing Mechanism
- Unit/integration: `npm test` (runs `vitest`)
- E2E: `npm run test:e2e` (runs `playwright test`)

### Log Access (for environment tests)
- Dev server: `npm run dev` console output
- Browser: DevTools Console and Network tab for SSE stream inspection
- Playwright: trace viewer and screenshots on failure

### Test Cases

| Acceptance Criterion | Unit Tests | Integration Tests | E2E Tests |
|---|---|---|---|
| AC-1: Chat produces visible AI response | Test that `handleSend` adds assistant placeholder message before streaming; test that streaming update logic writes to assistant message | Mock SSE endpoint and verify full message flow in `report-chat` component | Manual verification via dev server (existing `analysis.spec.ts` does not cover chat) |
| AC-2: Prompt contains 10 clinical rules | Assert prompt contains key phrases for each rule (functional vs structural, color interpretation, etc.) | N/A | N/A |
| AC-3: Prompt output sections match required list | Assert all new section keys present in prompt JSON template; assert `REPORT_SECTION_KEYS` matches | Validate `reportContentSchema` accepts new format and rejects old | N/A |
| AC-4: All tests passing | Run `npm test` -- all green | Same | Run `npm run test:e2e` -- all green |

## Phases

### Implementation

**Phase 1: Implementation (can run in parallel)**
- [x] Task #1: Fix post-report chat streaming bug - add empty assistant message placeholder
  - Can run in parallel with: Task #2, Task #3, Task #4
  - Required for: Task #5, Task #6
- [x] Task #2: Update report section types for new 12-section structure
  - Can run in parallel with: Task #1, Task #3, Task #4
  - Required for: Task #6
- [x] Task #3: Replace standard analysis system prompt with clinically precise version
  - Can run in parallel with: Task #1, Task #2, Task #4
  - Required for: Task #6
- [x] Task #4: Rewrite prompts unit tests for new prompt content and section keys
  - Can run in parallel with: Task #1, Task #2, Task #3
  - Required for: Task #6

**Phase 2: Testing (sequential; depends on Phase 1)**
- [x] Task #5: Add unit test for chat streaming bug fix
  - Depends on: Task #1
  - Required for: Task #6
- [x] Task #6: Run all unit and integration tests - verify passing
  - Depends on: Task #1, Task #2, Task #3, Task #4, Task #5
  - Required for: Task #7, Task #8

**Phase 3: Final Verification (sequential; depends on Phase 2)**
- [x] Task #7: Run e2e tests - verify no regressions
  - Depends on: Task #6
- [x] Task #8: Manual verification of chat streaming in dev server ⚠️ REQUIRES USER ACTION
  - Depends on: Task #6
