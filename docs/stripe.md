# Stripe integration — plan and status

Last updated: 2026-07-23. This is a living status doc, not a dated snapshot — update it as steps complete.

## Context

- Business: Narasimha Solutions, iridology reading reports. Tiers: `basic_1990` (€19.90), `premium_2990` (€29.90) — `TIER_PRICING` in `src/types/client-analysis.ts`.
- Clients worldwide, ~80% Europe, app already in en/es/de.
- Tax: owner's manager confirmed the formal tax filing/registration ("alta") happens in December, but the owner **can already invoice/bill now** — that is no longer a blocker for going live. Still, keep `automatic_tax` OFF until December regardless (that's a separate Stripe Tax feature, not a general billing permission).
- Domain: **narasimhasolutions.com** purchased 2026-07-23 (1 year, registrar: Raiola Networks, €13.54). Added to the Vercel project (`vercel domains add narasimhasolutions.com`). Nameservers switched at the registrar to `ns1.vercel-dns.com` / `ns2.vercel-dns.com` (Option B — full delegation to Vercel; fine since it's a fresh domain with nothing else configured on it yet). Confirmed propagated at the DNS level as of 2026-07-23 23:3x (Google's `8.8.8.8` resolver already returns the Vercel nameservers) — but `vercel domains inspect narasimhasolutions.com` still showed the nameservers as unverified (☓) as of end of session; Vercel's own verification/SSL issuance can lag behind actual DNS propagation. **First thing to check next session**: run `vercel domains inspect narasimhasolutions.com` again — once it shows ✓, the domain is live and ready for Apple Pay domain verification + Stripe live mode.
- Payment UI already redesigned (see `src/app/client/intake/payment/page.tsx`) — branded checkout summary, "Proceder al pago" button.
- Chosen integration shape: **Stripe Checkout Sessions (Stripe-hosted page)**, not a custom card form / Payment Element. Decided for lower long-term maintenance; the owner explicitly picked this over keeping a fully custom card-entry UI.
- Discount code: the owner's own 100%-off testing code (`OWNER_TEST_DISCOUNT_CODE` env var) is intentionally **separate from Stripe** — when applied, the flow skips Stripe entirely and marks paid directly. It is not a real customer-facing discount feature. Implementation note (deviates slightly from the original plan wording): the discount-code path and `ENABLE_MOCK_PAYMENT` used to share the same gate in `/api/client/payment`, which would have broken the discount code in Production once mock payment gets disabled there again. Now the server re-validates the submitted code itself and bypasses `ENABLE_MOCK_PAYMENT` independently when it's valid — see step 5 below.

## Branching

- Work on `staging` (already created as a clone of `master`, pushed to origin).
- Merge `staging` → `master` only once Stripe is verified working in `staging` with Stripe **test mode** keys, AND the domain is resolved (only then flip to Stripe **live** keys on `master`/Production). The December-alta gate on going live has been lifted (see Context above) — domain is now the only real blocker.
- `master` = Production = stable. Never enable `ENABLE_MOCK_PAYMENT` on Production. **Currently a temporary exception**: `ENABLE_MOCK_PAYMENT` was re-enabled on Production on 2026-07-23 as a stop-gap so the owner could test the payment step before Stripe was ready. **Must be removed from Production** as part of step 10, once Stripe live is confirmed working there.

## Vercel env vars

- `OWNER_TEST_DISCOUNT_CODE` — Production. Value: `NARASIMHA100`.
- `ANTHROPIC_API_KEY` — Production (backup copy of the value already stored in the admin Settings DB table, which takes priority).
- `ENABLE_MOCK_PAYMENT` — Preview (`staging` branch only), Development, **and temporarily Production** (see Branching note above — remove at step 10).
- `STRIPE_SECRET_KEY` — Preview (`staging` branch only) and Development. Restricted test-mode key (`rk_test_...`), scope: Checkout Sessions write only. Not yet set on Production (needs a live-mode restricted key at step 10).
- `STRIPE_WEBHOOK_SECRET` — Preview (`staging` branch only). Signing secret (`whsec_...`) for the "empowering-celebration" test-mode webhook endpoint. Not yet set on Production.
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
- [ ] 10. Once the domain is verified live on Vercel: switch Stripe keys from test to live in Production, activate PayPal/Bizum/Google Pay/Apple Pay for real, verify Apple Pay domain association, remove `ENABLE_MOCK_PAYMENT` from Production, merge `staging` → `master`. **Blocked on**: `vercel domains inspect narasimhasolutions.com` showing the nameservers as verified (✓) — domain is bought and DNS is pointed, just waiting on Vercel's own verification to catch up (was still ☓ as of 2026-07-23 end of session, despite DNS already resolving correctly externally).

## Also fixed along the way (unrelated to Stripe, found during testing)

- The 2026-07-22 payment-tier rename (`basic_12`/`premium_19_90` → `basic_1990`/`premium_2990`) shipped a migration file (`docs/migrations/015-rename-payment-tiers.sql`) that was never actually applied to the database — every `/api/client/intake` call had been failing with a 500 in Production since that commit. Applied directly against Production on 2026-07-23; also fixed the migration file's operation order (it dropped the CHECK constraint after updating rows to the new values, which the still-active old constraint rejects).

Step 10 is now the only remaining step, gated solely on the domain purchase/DNS above.
