---
name: regression-test-policy
description: Testing policy for any change to this project's production code. Use before writing or modifying any production code, alongside changes-awareness — write and show a failing real-path regression test before the fix, never mock the layer under test, and follow the fixed order: red test → edge cases → minimal fix → full suite.
---

# Regression Test Policy

## The order (non-negotiable)

1. Before touching production code, write a regression test that reproduces the bug through the REAL path — user input, persistence, output exactly as the user sees it. Run it and show the real failing output. If it passes, you have NOT reproduced the bug: say so and fix the test, not the code.
2. Add the adjacent edge cases this same fix could break. If there are more than 3, propose them before writing.
3. Only then apply the minimal fix.
4. Run the new test, then the full suite. Paste both outputs.
5. If a prior test breaks: STOP and say so. Never modify or skip it without explicit approval.

## What NOT to do

- Unit tests that verify mocks instead of behavior.
- Tests that only check a function returns what you just fed it.
- Tests written after the fix and adjusted until they pass.
- Mocking the layer you're fixing.

## Mocking rules

- Only mock what's external and slow: network, payments, third-party APIs, AI models.
- Never mock the layer under test.
- For AI model responses: mock the response, but let the real prompt-construction and parsing pipeline run — that's where the bugs actually are.

## Naming

One regression test per bug, named with the bug's identifier or a clear description of it.

## Assertions

On observable behavior only — never on internal structure or mock call counts.

## Framework

Whatever already exists in this repo (Vitest — see `iridology-app-map` for how tests run). Never introduce another.

## When something can't be tested without a refactor

Say so and wait. Do not refactor unilaterally to make it testable.

## Deliverable at the end of every change

- What test was added.
- What it covers.
- What it does NOT cover.
- What remains unprotected.
