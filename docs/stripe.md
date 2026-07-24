# Stripe integration — plan and status

Last updated: 2026-07-23. This is a living status doc, not a dated snapshot — update it as steps complete.

## Context

- Business: Narasimha Solutions, iridology reading reports. Tiers: `basic_1990` (€19.90), `premium_2990` (€29.90) — `TIER_PRICING` in `src/types/client-analysis.ts`.
- Clients worldwide, ~80% Europe, app already in en/es/de.
- Tax: owner's manager confirmed the formal tax filing/registration ("alta") happens in December, but the owner **can already invoice/bill now** — that is no longer a blocker for going live. Still, keep `automatic_tax` OFF until December regardless (that's a separate Stripe Tax feature, not a general billing permission).
- Domain: **narasimhasolutions.com** purchased 2026-07-23 (1 year, registrar: Raiola Networks, €13.54). Nameservers `ns1/ns2.vercel-dns.com`. **Confirmed verified (✓) on Vercel as of 2026-07-24.** No Apple Pay domain registration needed — see step 10 note below, that requirement only applies to Elements/embedded Checkout, not the hosted redirect Checkout this app uses.
- Payment UI already redesigned (see `src/app/client/intake/payment/page.tsx`) — branded checkout summary, "Proceder al pago" button.
- Chosen integration shape: **Stripe Checkout Sessions (Stripe-hosted page)**, not a custom card form / Payment Element. Decided for lower long-term maintenance; the owner explicitly picked this over keeping a fully custom card-entry UI.
- Discount code — **one input field, two kinds of code**, both entered in the app's own payment page (never Stripe's hosted page):
  - The owner's private bypass code (`OWNER_TEST_DISCOUNT_CODE` env var) — skips Stripe entirely, marks paid directly. Not a real transaction, not customer-facing.
  - Any real Stripe Promotion Code — validated live against Stripe (`/api/client/payment/discount-code`), shows the actual discounted total in the UI, and is applied to the real Checkout Session (`discounts: [{ promotion_code }]`) so it produces a real (reduced-amount) transaction. Added 2026-07-24 specifically so a cheap real-money test (see step 10) doesn't require a second, confusing code box on Stripe's own hosted page.
  - Implementation note (deviates slightly from the original plan wording): the owner-code path and `ENABLE_MOCK_PAYMENT` used to share the same gate in `/api/client/payment`, which would have broken the discount code in Production once mock payment gets disabled there again. Now the server re-validates the submitted code itself and bypasses `ENABLE_MOCK_PAYMENT` independently when it's valid — see step 5 below.
- Root domain routing fix (2026-07-24): the bare domain (`narasimhasolutions.com`) used to redirect to `/practitioner`, which the auth proxy then bounced to `/login` before any customer ever saw `/client`. `src/proxy.ts` now rewrites `/` to `/client` (no visible URL change); the practitioner login flow's post-login redirect now targets `/practitioner` directly instead of `/`. `/practitioner` itself is unchanged — still login-gated, only reached by direct/typed URL.
- **Stripe MCP account mismatch (open issue, next session should check)**: the Stripe MCP plugin connected via OAuth to a **sandbox** account (`acct_1TRTF5EbCcZlrSyU`, fake KYC data) instead of the real live business account (`acct_1TRTEsExY5t9Cfd2`) that the owner activated by hand in the Dashboard. The MCP key currently has **no API access** to the real account. Reconnecting (disconnect the Stripe integration in Claude's settings, then reauthorize, checking the account name shown on Stripe's consent screen before accepting) would restore programmatic access if needed later.

## Branching

- **Current state (2026-07-24)**: `master` still has NONE of the Stripe integration work — it's frozen on the old mock-payment-only version on purpose, until everything below is proven live. `staging` has all of the test-mode work (steps 1-9). `feature/stripe-go-live` was branched from `staging` and additionally has the root-routing fix and the discount-code refactor (see Context above). **Nothing has been merged yet** — not feature→staging, not staging→master.
- Plan: finish testing on `feature/stripe-go-live` (or merge it to `staging` first, tester's call) → once the live flow is proven with a real minimal charge → merge `staging` → `master`.
- `master` = Production = stable. Never enable `ENABLE_MOCK_PAYMENT` on Production. **Currently a temporary exception**: `ENABLE_MOCK_PAYMENT` was re-enabled on Production on 2026-07-23 as a stop-gap so the owner could test the payment step before Stripe was ready. **Must be removed from Production** as part of step 10, once Stripe live is confirmed working there.

## Vercel env vars

- `OWNER_TEST_DISCOUNT_CODE` — Production. Value: `NARASIMHA100`.
- `ANTHROPIC_API_KEY` — Production (backup copy of the value already stored in the admin Settings DB table, which takes priority).
- `ENABLE_MOCK_PAYMENT` — Preview (`staging` branch only), Development, **and temporarily Production** (see Branching note above — remove at step 10).
- `STRIPE_SECRET_KEY` — Preview (`staging` branch only) and Development: restricted test-mode key (`rk_test_...`), scope: Checkout Sessions write only. **Production (added 2026-07-24)**: restricted **live-mode** key (`rk_live_...`), same scope (Checkout Sessions write only, template "One-time payments" pared down to just that one permission).
- `STRIPE_WEBHOOK_SECRET` — Preview (`staging` branch only). Signing secret (`whsec_...`) for the "empowering-celebration" test-mode webhook endpoint. Not yet set on Production — still pending, see step 10.
- **Vercel Deployment Protection bypass**: Preview deployments (staging) have Vercel Authentication enabled, which blocks external callers like Stripe's webhook with a 401 — this is a Preview-only concern, confirmed Production is publicly reachable without it. Fixed by enabling "Protection Bypass for Automation" on the project (`vercel project protection enable iridiology-app --protection-bypass`) and appending `?x-vercel-protection-bypass=<secret>` to the webhook URL configured in Stripe. Not needed once the webhook points at Production.

## Steps

- [x] 1. Install the Stripe SDK (`stripe` npm package), create the server-side Stripe client. — `src/lib/stripe/server.ts`.
- [x] 2. Create a **restricted API key** (`rk_`) in the Stripe Dashboard with minimal scopes (Checkout Sessions write only — Webhooks read turned out unnecessary, signature verification is local HMAC, no API call).
- [x] 3. New endpoint to create a Checkout Session — `src/app/api/client/payment/checkout-session/route.ts`. Deviates from the original plan wording: derives the tier from the `client_analyses` row itself rather than trusting a client-supplied `tier` in the request body, so a tampered request can't get a cheaper price. No `automatic_tax`, no explicit `payment_method_types`.
- [x] 4. PayPal, Bizum, Google Pay, and Apple Pay activated in the Stripe Dashboard (test mode).
- [x] 5. Payment page wired — `src/app/client/intake/payment/page.tsx`. Discount code re-validated server-side in `/api/client/payment`, independent of `ENABLE_MOCK_PAYMENT` (see Context above for why).
- [x] 6. Webhook endpoint — `src/app/api/client/payment/webhook/route.ts`. Verifies the Stripe signature, marks `client_analyses.status = 'paid'` on `checkout.session.completed`.
- [x] 7. Duplicate-delivery guard — reuses the existing `status = 'intake_pending'` CAS pattern (Option A: no separate events-processed table, since this webhook's only side effect today is the status flip). Uses a plain array `select()` instead of `.single()` so a genuine DB failure (500, triggers a Stripe retry) is distinguishable from an already-handled delivery (200, no retry).
- [x] 8. Webhook configured in Stripe test mode, pointed at `staging`, with the Vercel protection-bypass query param (see Vercel env vars above).
- [x] 9. Full flow tested in `staging` with Stripe's `4242 4242 4242 4242` test card — confirmed `client_analyses.status = 'paid'`, `is_mock_payment = false`, `paid_at` set correctly via the webhook.
- [ ] 10. Go live in Production. Domain blocker is gone (verified ✓ 2026-07-24); this step is now in progress, broken down below.
  - [x] Domain verified live on Vercel.
  - [x] Live Stripe account activated: business profile filled in (category "Health & wellness"-type, non-medical product description), 2FA via passkey, payout schedule set to automatic/weekly, statement descriptor set to `NARASIMHA IRIDOLOGY`. Stripe Tax ("automate tax collection") explicitly skipped for now — matches the December-alta plan in Context above.
  - [x] Live restricted key (`rk_live_...`, Checkout Sessions write only) created and stored in Vercel Production as `STRIPE_SECRET_KEY`.
  - [x] Root-domain routing fix and discount-code-supports-real-Stripe-codes refactor, both on `feature/stripe-go-live` (not yet merged — see Branching above).
  - [ ] **Next**: prove the live flow works end-to-end with one real minimal charge — cheaper than a full live tier price. A Stripe coupon `TESTLIVE1EUR` already exists (18.90€ off the Essential/basic tier, once, live mode) — enter it in the app's own discount-code box (not Stripe's page) to bring the Essential tier down to 1.00€, then pay with a real card. Confirms the live key + live webhook wiring, not just the business logic (already proven in test mode at step 9). Note: Stripe generally does not refund its own processing fee even if the charge itself is refunded afterwards — a few cents, non-recoverable, is the accepted cost of this check.
  - [ ] Activate PayPal, Bizum, Google Pay for real in the Stripe Dashboard (live mode). Apple Pay/Google Pay do **not** need domain registration for this app (hosted Checkout, not Elements/embedded — confirmed in Stripe's docs 2026-07-24).
  - [ ] Bizum-specific requirement found 2026-07-24: before Bizum can go live, the account needs a DNI/NIE (or company tax ID) added under Stripe's Tax settings — separate from the general account activation above.
  - [ ] Configure the live-mode webhook, pointed at Production (`narasimhasolutions.com`), no protection-bypass query param needed (Production isn't behind Vercel Authentication, unlike `staging`'s preview deployments).
  - [ ] Remove `ENABLE_MOCK_PAYMENT` from Production.
  - [ ] Merge `feature/stripe-go-live` → `staging` → `master`.

## Also fixed along the way (unrelated to Stripe, found during testing)

- The 2026-07-22 payment-tier rename (`basic_12`/`premium_19_90` → `basic_1990`/`premium_2990`) shipped a migration file (`docs/migrations/015-rename-payment-tiers.sql`) that was never actually applied to the database — every `/api/client/intake` call had been failing with a 500 in Production since that commit. Applied directly against Production on 2026-07-23; also fixed the migration file's operation order (it dropped the CHECK constraint after updating rows to the new values, which the still-active old constraint rejects).

Step 10 is now the only remaining step. Domain is verified, live account is active, live key is in Vercel — next action is the €1 real-charge test described above, then live payment methods, then the merge chain to `master`.
