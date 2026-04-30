# Declutter Log

Each entry follows: **Bug or excess** → **Rule applied** → **Fix** → **Verified**.

The principle: every pixel of UI must justify its claim on the user's attention.
If a container, image slot, divider, or empty stat doesn't help the user do
their task, it gets cut. Aesthetic empty space is fine; aesthetic noise isn't.

## Phase 1 — Joelle seed data

Seed script: `scripts/seed-joelle.ts`. Idempotent — re-run without dupes.

Populated under Joelle's tenant:
- 12 clients across all states (active mid-package, renewing-soon, pending
  payment, expired, archived) plus 1 unclaimed `client_invites` row for
  "Dana Tabbara" (code `DANATB`)
- 4 new session templates (push, squat, conditioning, mobility) on top of
  Joelle's 2 existing — total 6
- ~44 sessions (30 completed across past 60d, 8 future, 3 client requests, 2
  cancelled, 1 in-app prescribed)
- Time-series client logs: weight (~30d per client), cycle (4 phases), mood,
  sleep, measurements, PRs — distributed by each client's enabled fields

Existing universal exercise library (111 entries across 8 groups) covers the
"40 across 6 groups" baseline — no new exercises added.

Existing 5 packages cover the spec — no package overwrites (avoiding disrupting
real testing artifacts).

## Phase 2 — Declutter targets (running list)

(populated during the audit pass, then closed off as fixes land)
