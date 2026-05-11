# Beta 2 — deferred features

Things we cut from Beta 2 scope to ship the simpler trainer↔client
loop. Each item below is genuinely valuable but depends on
infrastructure that isn't in place yet. Code paths for these
features are **gated behind feature flags in `src/lib/features.ts`,
not deleted** — re-enabling is a flag flip, not a re-implementation.

---

## In-app sessions + $3 per-session fee

**Flag:** `FEATURES.IN_APP_SESSIONS` (currently `false`).

**Why deferred:** The flow charges the client $3 per in-app workout.
Without Stripe wired, there's no way to collect that — and faking it
with external payments would create a confusing UI where the trainer
has to also reconcile per-session amounts with their package
collection. The cleaner pattern is to wait for Stripe, then ship the
full feature with platform-routed billing.

**What's gated off while the flag is `false`:**

- The `in-app` option in every trainer session-type picker
  (calendar quick-schedule, schedule-form, inline session row,
  session-type editor).
- The "approve as in-app" menu item on `SessionRow`.
- The trainer dashboard's `in_app_upgrade` action-feed row
  (the resolver loop skips the `client_requested` in-app branch).
- The client portal's "extra workout · $3" CTA button and the
  `ExtraInAppDialog` confirm modal.
- The `+$3` badge on `client_requested` session cards.
- The `requestExtraInAppSession` server action: returns
  `fail("Extra in-app workouts are paused for Beta 2...")` at the
  top, before any DB writes, so a direct POST or stale form can't
  bypass the UI gate.
- Empty-state and FirstTimeNudges copy on the dashboard no longer
  mentions in-app upgrades.

**What's preserved (intentional):**

- The `sessions.session_type` enum still accepts `'in_app'`. Don't
  remove the value — re-enabling is a flag flip, not a migration.
- `sessions.in_app_origin` column stays. So does
  `sessions.in_app_surcharge_paid`.
- `EXTRA_INAPP_PRICE_USD = 3` constant stays in `src/lib/pricing.ts`.
- Legacy `session_type = 'in_app'` rows on Joelle's seed tenant
  still exist. They render as `online` (via `prettySessionType`
  mapping) and display a small note on the session-detail pages
  for both trainer and client: *"This session was originally set
  to in-app — that option is paused for Beta 2."*

## Re-enable checklist (when Stripe is wired)

In order:

1. **Flip the flag.** Set `FEATURES.IN_APP_SESSIONS = true` in
   `src/lib/features.ts`. All the gated UI surfaces above resurface
   automatically.
2. **Wire Stripe** for the $3 charge. New table
   `session_fees(id, session_id, client_id, tenant_id, amount_cents,
   currency, status, stripe_payment_intent_id, ...)`. New routes:
   `/client/bookings/[id]/pay-session-fee` and
   `/api/billing/session-fee/[bookingId]/checkout`.
3. **Connect** `requestExtraInAppSession` to the payment flow — the
   action currently creates a `sessions` row with
   `in_app_origin = 'client_requested'` and a `payments` row at
   `amount_usd = 3, method = 'manual', status = 'pending'`. Replace
   the `payments` insert with a `session_fees` insert + Stripe
   Checkout redirect.
4. **Per-session in-app override** affordance for the trainer.
   Per Beta 2 deferral notes: the trainer should be able to flip a
   single session (not the whole package) to in-app from the
   session-detail page. The `SessionTypeEditor` already supports
   this — its dropdown re-exposes the option when the flag is on.
5. **Monthly in-app batch tracking** on the trainer side. A
   per-client view + a studio-wide aggregate that shows total $3
   fees collected in the current month, with a "mark batch settled"
   action — `markBatchSettled({ clientId, month })`.
6. **Decide on routing** for the $3:
   - **Option A** (matches the package model): external payment
     between trainer ↔ client, trainer reconciles with Form Studio
     in bulk. Cheaper to ship; no Stripe Connect needed.
   - **Option B**: platform-routed via Stripe Connect, money flows
     client → Form Studio → trainer minus platform fee. Heavier
     setup, cleaner experience.

## Notes on flag hygiene

- **Don't conditionally import** flagged code. That breaks
  tree-shaking and makes re-enabling fragile. Use
  `if (FEATURES.X)` guards inside the component tree instead.
- **Don't duplicate** the flag check in dozens of places. Where
  multiple call sites need the same gate, centralize via a
  helper (e.g. `prettySessionType` already collapses
  `in_app → "online"` while the flag is off — every caller benefits
  from one rule).
- **Don't delete** legacy data. The seed has `session_type =
  'in_app'` rows; we map them to `"online"` for display rather
  than scrubbing them, because re-enabling the flag should make
  those rows behave correctly again.

## Adjacent things NOT deferred

For the record, these are explicit Beta 2 features and should not
be confused with the in-app pause:

- Trainer marks client packages as `paid` / `pending` via the
  `/studio/clients/[id]` profile. Audit log on every status change.
  See `INVITE_LINKAGE_DEBUG.md`-adjacent commits and
  `subscription_status_log` table.
- Client dashboard has full access regardless of payment status.
- Packages have only two delivery types in Beta 2: `in_person` and
  `online`. The package form already enforces this.
