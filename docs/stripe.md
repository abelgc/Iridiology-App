# Stripe integration — plan and status

Last updated: 2026-07-22. This is a living status doc, not a dated snapshot — update it as steps complete.

## Context

- Business: Narasimha Solutions, iridology reading reports. Tiers: `basic_1990` (€19.90), `premium_2990` (€29.90) — `TIER_PRICING` in `src/types/client-analysis.ts`.
- Clients worldwide, ~80% Europe, app already in en/es/de.
- No Stripe Tax / IVA yet — owner's business registration ("alta") is in December. Do not enable `automatic_tax` before then.
- Domain: the final production domain isn't bought/pointed yet. Needed before activating Stripe live mode (account activation, Apple Pay domain verification, stable webhook URL).
- Payment UI already redesigned (see `src/app/client/intake/payment/page.tsx`) — branded checkout summary, "Proceder al pago" button, still backed by the old mock endpoint (`/api/client/payment`) until this plan lands.
- Chosen integration shape: **Stripe Checkout Sessions (Stripe-hosted page)**, not a custom card form / Payment Element. Decided for lower long-term maintenance; the owner explicitly picked this over keeping a fully custom card-entry UI.
- Discount code: the owner's own 100%-off testing code (`OWNER_TEST_DISCOUNT_CODE` env var, checked server-side in `/api/client/payment/discount-code`, never exposed to the browser) is intentionally **separate from Stripe** — when applied, the flow should skip Stripe entirely and go straight to the existing mock-style "mark as paid" path. It is not a real customer-facing discount feature.

## Branching

- Work on `staging` (already created as a clone of `master`, pushed to origin).
- Merge `staging` → `master` only once Stripe is verified working in `staging` with Stripe **test mode** keys, AND the domain + December alta are resolved (only then flip to Stripe **live** keys on `master`/Production).
- `master` = Production = stable. Never enable `ENABLE_MOCK_PAYMENT` on Production.

## Vercel env vars already set (as of 2026-07-22)

- `OWNER_TEST_DISCOUNT_CODE` — Production. Value: `NARASIMHA100` (reused deliberately from the design mockup after the owner's explicit call).
- `ANTHROPIC_API_KEY` — Production (backup copy of the value already stored in the admin Settings DB table, which takes priority).
- `ENABLE_MOCK_PAYMENT` — Preview (`staging` branch only) and Development. **Not set on Production.**

## Steps

- [ ] 1. Install the Stripe SDK (`stripe` npm package), create the server-side Stripe client.
- [ ] 2. Create a **restricted API key** (`rk_`) in the Stripe Dashboard with minimal scopes (Checkout Sessions write, Webhooks read) — use this instead of the full secret key.
- [ ] 3. New endpoint to create a Checkout Session: takes `{report_download_token, tier}`, looks up the real price from `TIER_PRICING`, currency EUR, `success_url`/`cancel_url` carrying the token back into the app, **no `automatic_tax`** (per the December constraint above), **never pass `payment_method_types`** (let Stripe's dynamic payment methods show Visa/Mastercard/PayPal/etc. automatically per customer).
- [ ] 4. Activate PayPal in the Stripe Dashboard (Settings → Payment methods) — a Dashboard config step, no code.
- [ ] 5. Payment page's "Proceder al pago" button calls this new endpoint and redirects the browser to `session.url` — **except** when the owner's discount code is applied, in which case keep today's direct mock-style "mark as paid" path (no Stripe involved at all for that case).
- [ ] 6. Webhook endpoint (`checkout.session.completed`) — becomes the **only** place that marks `client_analyses.status = 'paid'`, replacing today's client-asserted mock POST. Verify the Stripe webhook signature.
- [ ] 7. Guard the webhook against duplicate delivery (Stripe retries webhooks) — use the Stripe event id, in addition to the same `status`-guarded CAS pattern already used in `/api/client/payment`, `/api/client/upload`, and `/api/client/internal/stage2`.
- [ ] 8. Configure the webhook URL in Stripe, pointed at `staging` first.
- [ ] 9. Test the whole flow in `staging` using Stripe's test-mode card numbers (fake money, real flow) — this replaces using the mock to test the payment step itself.
- [ ] 10. Once verified: switch Stripe keys from test to live in Production, activate PayPal for real, merge `staging` → `master`. **Blocked on**: final domain purchased/pointed, and the owner's December business registration (alta) completed.

Steps 1–9 have no external blockers and can be done in any session. Step 10 is the only one gated on the domain/December items above.
