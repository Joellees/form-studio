# Beta 2 — Subscription & Access System

Built 2026-05-13. This is the pre-Stripe foundation. Three integrated
systems:

1. **Access codes** — DB-backed (`public.access_codes`). Every signup
   must redeem a valid, non-revoked code. Codes bind 1:1 to a Clerk
   userid on first redemption — same user can redeem again to restore
   their studio after soft-delete; any other user is rejected.
2. **Subscription model** with cohort + status (independent axes) in
   `public.trainer_subscriptions`. Status meanings:
   - `founding` — free forever, never gated
   - `active`   — paid, `paid_until` in future (1-day grace)
   - `expired`  — past-grace OR fresh signup awaiting first payment
   - `canceled` — manually canceled by admin
3. **Admin tool at `/admin`** — operator console (only routes
   reachable via `SUPER_ADMIN_CLERK_IDS` env var match). Lists every
   trainer with cohort/status/cadence/currency, lets ops mark paid,
   change cohort, cancel, grant founding, soft-delete, restore.
   `/admin/codes` manages the access code inventory.

## Data model

| table | role |
|---|---|
| `access_codes` | every redeemable code; user-binding, redemption count, revocation |
| `access_code_events` | audit log: created / redeemed_first_time / redeemed_return / revoked |
| `trainer_subscriptions` | one row per studio, holds cohort + status + cadence + currency + paid_until |
| `trainer_subscription_events` | audit log: subscription_created / marked_paid / status_changed / cohort_changed / reminder_sent / expired / canceled / renewed / founding_granted / restored / soft_deleted |
| `trainers` | denormalized cache columns: `cohort`, `subscription_status`, `paid_until`, `soft_deleted_at`. Updated transactionally with `trainer_subscriptions`. |

## Architectural choices

### Where the subscription gate runs

Spec called for the gate to live in edge middleware. **In practice it
runs in `src/app/studio/layout.tsx`** (server component, reads the
denormalized cache on `trainers`). Reason: Next.js edge middleware
can't query Supabase without adding an HTTP roundtrip to every
`/studio/*` request. Reading the cache in a layout adds no extra
roundtrip (the layout already fetches the trainer row to set up
StudioShell). When/if we move to Edge Runtime with custom Clerk JWT
claims, this can shift back to middleware — same logic, just earlier.

The `x-pathname` header set by middleware lets the layout self-exempt
`/studio/expired` so the redirect doesn't loop.

### Access code redemption

`/beta` form → `enterBeta` action → DB lookup → cookie set → redirect.
`/beta/unlock?code=…` GET → `redeemAccessCode` → same path. The
legacy `BETA_CODES` env-var system is **deprecated** — `lib/beta.ts`
keeps the parser around for cookies that haven't migrated yet, but
new entry is exclusively through `public.access_codes`.

Binding happens in two places:
1. **At redemption time** (if Clerk user is already signed in):
   `bound_to_clerk_user_id` is set in the redemption action.
2. **At onboarding time** (for fresh signups): the `fs_beta` cookie is
   read in `completeOnboarding`, the matching `access_codes` row is
   looked up, both `bound_to_clerk_user_id` and `bound_to_studio_id`
   are set, and the `trainer_subscriptions` row is created with
   cohort defaults. This is the `bindAccessCodeOnOnboarding` helper.

Idempotency is built in: a same-user re-redemption clears
`trainers.soft_deleted_at` (restoring the studio) but preserves
subscription status. Wrong-user redemption is rejected with a clear
error.

### Pricing & cohorts

`lib/cohorts.ts` defines `COHORTS` — a typed map. Adding a new
cohort is a **code change, not a migration** (the column on
`trainer_subscriptions` is plain text). `lib/pricing.ts` exports
`PRICING` for `beta_2` + `launch` × `monthly` + `annual` × `usd` +
`aed` + `sar`. `beta_1` has no pricing (founders are free).

### Daily cron

`/api/cron/daily-sync` runs at 09:00 UTC (configured in `vercel.json`).
Protected by `Authorization: Bearer ${CRON_SECRET}`. Two
responsibilities, both idempotent:

1. Flip past-grace `active` → `expired` (and write the audit row).
2. Send 3-day reminder emails; mark `reminder_sent_at` to prevent
   duplicate sends.

`reminder_sent_at` is reset to `null` whenever a subscription is
marked paid again, so the next renewal window will trigger a fresh
reminder.

## Backfill

All 4 existing trainers (Joelle, Johnny, Laurent, Rand) were
backfilled as `beta_1` / `founding`. Their existing trainer codes
(`Joelle-trainer-01`, etc.) were migrated into `public.access_codes`
as `beta_1` rows, with the 4 in-studio trainers pre-bound to their
Clerk IDs (so re-redemption is a no-op restore). The 3 unclaimed
trainer codes (Jad / Wissam / Emer) are available for first
redemption.

## Operator runbook

### Hand out a beta 2 code

1. Open `/admin/codes`
2. "Generate access code" → pick cohort `beta_2`, type label (e.g.
   "Sarah Khalil"), optional internal note → generate
3. "Copy with WhatsApp message" → paste into WhatsApp
4. When the trainer redeems + pays externally, find them on `/admin`
   (filter by cohort=beta_2, status=expired) and "Mark paid"

### Trainer says "I paid"

1. Open `/admin`
2. Search by name or email
3. Row "⋯" menu → "Mark paid" → pick cadence + currency (defaults
   to their existing or cohort default) → confirm
4. Their `paid_until` extends one month/year from current
   `paid_until` (or from now if expired). Reminder marker resets.

### Trainer wants to pause

1. `/admin` → row "⋯" → "Cancel subscription"
2. Their `/studio/*` access is blocked. They can hit `/studio/expired`
   for the WhatsApp CTA.
3. When they return: row "⋯" → "Reactivate" → if `paid_until` still
   in the future, back to active; otherwise back to expired (then
   mark paid).

### Trainer is leaving

1. `/admin` → row "⋯" → "Soft-delete" (with confirm)
2. Studio is blocked, but `clients` / `sessions` / `packages` /
   `exercises` / history are all preserved. The `trainer_subscriptions`
   row is unchanged.
3. If they return with the same Clerk user + access code →
   redemption clears `soft_deleted_at` and they land on their
   restored studio.

### Hard delete (GDPR)

Not exposed in the admin tool. Run as a manual DB operation. Cascade
order:
1. `delete from public.client_logs where tenant_id = ?`
2. `delete from public.sessions where tenant_id = ?` (cascades to
   session_blocks etc.)
3. `delete from public.subscriptions where tenant_id = ?` (the
   client-side subscriptions — note this is a different table from
   `trainer_subscriptions`)
4. … through every tenant-scoped table
5. `delete from public.trainer_subscription_events where studio_id = ?`
6. `delete from public.trainer_subscriptions where studio_id = ?`
7. `delete from public.trainers where id = ?` (cascade handles
   `access_codes.bound_to_studio_id` via the `on delete set null`
   FK — the code itself stays, just unbinds; revoke separately if
   needed)

## Deferred (will ship in follow-up)

These are in scope for the Beta 2 system per the spec but didn't
fit in this build pass. None is launch-blocking — operator can
do these manually through the admin table actions.

- **`/admin/trainers/[id]` detail page** — profile + subscription
  card + event-history table (interleaved `trainer_subscription_events`
  + `access_code_events` rows). Reachable today only via DB inspection
  or the admin list "..." menu actions.
- **Excel export** (Part 10) — 4-sheet workbook via `exceljs`:
  Trainers + Summary + Event log + Access codes. Hook lives at
  `/admin/api/export` (not yet implemented). Operator can pull the
  data directly from Supabase Studio in the meantime.
- **CRON_SETUP.md** companion doc. The cron itself is wired and
  protected; the doc captures the Vercel-side steps for new env vars
  (`CRON_SECRET`, `NEXT_PUBLIC_WHATSAPP_NUMBER`) and the schedule
  format. Currently embedded in this file.

## Re-enable path when Stripe arrives

The infrastructure here is intentionally Stripe-shaped. When Stripe
Connect lands in Beta 3, the changes are surgical:

1. Add `stripe_customer_id`, `stripe_subscription_id` columns to
   `trainer_subscriptions`.
2. Wire Stripe webhooks to call the existing `markTrainerPaid`
   server action (it's already idempotent, already writes audit
   rows, already updates the cache transactionally).
3. Add a "Renew with Stripe" CTA to `/studio/expired` for the
   `launch` cohort. Founders + Beta 2 grandfathered cohort keep the
   external-payment flow (with a "Renew via Stripe" toggle in
   `/studio/billing` if they want to switch).
4. Optionally make `launch` cohort signup skip the
   `access_codes` redemption — Stripe Checkout becomes the gate.
   Beta 1 + Beta 2 cohorts keep the code-redemption signup.

Cohorts, gating, audit log, soft delete, /studio/expired, the admin
tool, the cron — none of those change.

## Env vars added by this build

| var | purpose |
|---|---|
| `CRON_SECRET` | Bearer auth for `/api/cron/daily-sync`. Set on Vercel; Vercel cron sends it automatically per `vercel.json`. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Used by `/studio/expired` CTA + reminder email body. Public so the expired page can build the `wa.me/<number>` URL. Set to `96170000000` for now — replace with Joelle's real number before launch. |

Set both via `npx vercel env add` (already done for this deploy).
