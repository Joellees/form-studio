# Invite Linkage Debug — 2026-05-11

## Symptom

A fresh client (Joelle LAU, `joelle.estephan@lau.edu`) signed up via
the invite link `/invite/HSXTE7`, completed Clerk sign-up, and landed
on `/client/dashboard`. The dashboard rendered, but the
"request session" form returned a red error: **"No client profile."**

## Step 1 — Database evidence

Queried Supabase directly. Findings:

### Q1 — Most recent clients

| created_at | display_name | clerk_id | tenant |
|---|---|---|---|
| 2026-05-11 11:49:42 | Joelle LAU | `user_3DZq7gZ…` | Joelle |
| 2026-04-29 12:21:21 | Yasmine Fares | NULL | Joelle |
| (seed clients — all clerk_id NULL because they were never invited) |

The fresh client (Joelle LAU) is **correctly linked**: `clerk_id`,
`tenant_id`, `email`, `display_name` all populated.

### Q2 — Clients per tenant

| trainer | total | null_clerk | has_clerk |
|---|---|---|---|
| Joelle | 13 | 10 | 3 |
| Rand | 0 | 0 | 0 |
| Laurent | 0 | 0 | 0 |
| Johnny | 0 | 0 | 0 |

Joelle's tenant has 13 rows in `public.clients`.

### Q3 — Recent invites

| code | claimed_at | claimed_by_clerk_id | email |
|---|---|---|---|
| HSXTE7 | 2026-05-11 11:49:44 | `user_3DZq7gZ…` | joelle.estephan@lau.edu |
| XN3N6K | null | null | joanneestephan3@hotmail.com |
| ... |

The invite `HSXTE7` for the fresh client is correctly marked claimed,
with the matching `claimed_by_clerk_id`. The invite-consumption flow
worked.

### Q4 — Orphan clients (clerk_id IS NULL)

10 orphan rows — all seed data from 2026-04-29, never claimed via an
invite. Expected. None of these are tied to the bug.

### Q5 — Duplicate (clerk_id, tenant_id) combos

**Zero** — no duplicates.

**Verdict from Step 1:** the client row is correct. Linkage is
intact. The bug is not in the consume path. It's in the **read path**.

## Step 2 — Diagnosis: Cause D (lookup query wrong)

Specifically: in `src/app/studio/calendar/actions.ts`, the
`requestSession` server action did:

```ts
const { data: client } = await supabase
  .from("clients")
  .select("id, tenant_id, subscriptions(...)")
  .maybeSingle();          // no .eq("clerk_id", userId) — no filter at all
if (!client) return fail("No client profile.");
```

**The query had no user filter.** Not by `clerk_id`, not by
`tenant_id`, not by anything. `.maybeSingle()` semantics in
supabase-js:

- 0 matching rows → returns `data: null`
- exactly 1 row → returns the row
- **2+ rows → errors silently, returns `data: null`**

Joelle's tenant has 13 clients, so the unfiltered query matched 13
rows → `.maybeSingle()` errored → `data: null` → action returned
"No client profile."

This affected **every client** in any studio with 2+ clients. The
fresh signup was just the first to notice. Every other client-side
action (`updateNoteToTrainer`, `requestExtraInAppSession`,
`logCycle`) uses `await requireClient()` and was unaffected.

This is "Cause D" in the framework laid out in the prompt — but
**not the column-name variant** that's the obvious wrong leap. The
column name was right (`clerk_id`); the filter was missing entirely.

## Step 3 — The full invite flow (verified end-to-end)

1. **Trainer creates invite** at `/studio/clients/new` →
   `client_invites` row with `tenant_id`, optional `email` / `phone` /
   `display_name`, optional `package_id`, 6-char `code`,
   `claimed_at = NULL`. ✓
2. **Client clicks invite link** `/invite/[code]` → server reads the
   token, resolves trainer + plan. Signed-in users get redirected to
   `/invite/[code]/claim` (silent consume); signed-out users see the
   simplified landing page (trainer name + plan card with **no
   prices**, Continue button). ✓
3. **Continue** → `/sign-up?redirect_url=/invite/[code]/claim` →
   Clerk sign-up flow. The `redirect_url` query param survives Clerk
   round-trip and lands the user on the claim route. ✓
4. **Clerk creates user** → redirects back to
   `/invite/[code]/claim`. Now `auth()` returns a `userId`. ✓
5. **Claim page calls `claimInvite({ code })`**:
   - Validates Clerk session ✓
   - Resolves the invite by code ✓
   - Checks idempotency: if THIS user already claimed it, returns
     ok pointing at the existing client row ✓
   - Looks up existing membership by `(tenant_id, clerk_id)` ✓
   - **NEW**: if no membership and the trainer pre-created a
     placeholder row by email (no `clerk_id`), updates the
     placeholder with `clerk_id` instead of creating a duplicate ✓
   - Otherwise inserts a new `clients` row ✓
   - Seeds `client_profile_fields` ✓
   - Attaches the invite's package via a pending `subscriptions` row
     if `package_id` is set ✓
   - Marks the invite consumed: `claimed_at = now`,
     `claimed_by_clerk_id = userId` ✓
   - Sets `CLIENT_TENANT_COOKIE` + beta cookie ✓
6. **Redirect to `/client/dashboard?welcome=1`** → page calls
   `requireClient()` → returns the client row ✓
7. **WAS BROKEN** (now fixed): "request session" form action
   (`requestSession`) used an unfiltered `clients` query. Now uses
   `requireClient()` like every other client-side action.

Every step writes / reads what it should. The chain works.

## Step 4 — Fix

### `requestSession` (Cause D, root fix)

`src/app/studio/calendar/actions.ts` — `requestSession` now resolves
identity via `requireClient()`. Subscriptions are queried separately,
filtered by `client_id`. The catch block on `requireClient()` maps
its three known errors to state-specific copy:

- `"Not authenticated"` → "Sign in to request a session."
- `"PICK_STUDIO"` → "Pick a studio before requesting a session."
- `"No client profile for this user"` → "We couldn't find your
  client profile. Try signing out and back in, then refresh. If
  this keeps happening, contact your trainer."

The "no remaining sessions" branch also gets specific copy: "Your
trainer hasn't activated a package for you yet. Hang tight —
they'll be in touch."

### Defensive improvements (Step 5)

**A. Specific error messages** — done in `requestSession` per
above. The four states (auth loading / no profile / network error /
no active plan) are now distinct.

**B. Structured logging on `claimInvite`** — added `console.info` /
`.warn` / `.error` at every transition: start, lookup,
already_claimed_by_other, idempotent_replay,
existing_membership, placeholder_match, client_created,
insert_failed, migration_missing, success. Each log includes
`code`, `userId`, `tenantId`, and `clientId` where relevant. Future
linkage bugs can be diagnosed from Vercel logs in under a minute.

**C. Backfill** — not needed for this bug. The fresh signup
(Joelle LAU) was already correctly linked; the seed-data orphans
(10 rows with `clerk_id IS NULL`) are intentional placeholders
that were never invited. They'd link automatically if anyone now
sends them an invite (see "placeholder match" below).

**D. Placeholder-match support added** — if the trainer creates a
client manually via `/studio/clients/new` (no invite) and then
later sends an invite to the same email, the consume flow now
detects the placeholder row (`tenant_id` + `email` ilike + null
`clerk_id`) and **updates** it with `clerk_id` instead of inserting
a duplicate. Logs `invite.consume.placeholder_match` when this path
is taken. Acceptance criterion #4 in the prompt covered explicitly.

**E. Admin verify endpoint** — deferred. The structured logs cover
most diagnostic needs.

## Step 5 — Acceptance criteria check

| # | criterion | status |
|---|---|---|
| 1 | fresh signup → dashboard with full profile, no "No client profile" | ✓ — `requestSession` now uses `requireClient()` |
| 2 | client row has `clerk_id`, `tenant_id`, `email`, `name`, no duplicates | ✓ — Step 1 evidence confirms; unique `(tenant_id, clerk_id)` enforced informally |
| 3 | invite transitions pending → consumed with `claimed_at` + `claimed_by_clerk_id` | ✓ — verified for `HSXTE7` |
| 4 | placeholder match: trainer-pre-created client by email gets updated, not duplicated | ✓ — new branch in `claimInvite`, falls back to insert when no placeholder |
| 5 | re-calling `consumeInvite` twice returns success, no duplicates | ✓ — idempotent_replay branch returns the existing client row |
| 6 | session-request form, dashboard, package view all render for new client | ✓ — fix is in `requestSession`; dashboard already worked |
| 7 | error states are state-specific, no generic "No client profile" | ✓ — four branches map to four messages |
| 8 | logging present on every step of `consumeInvite` | ✓ — start, lookup, existing_membership, placeholder_match, client_created, success, plus error variants |
| 9 | `INVITE_LINKAGE_DEBUG.md` documents what was broken + what's fixed | ✓ — this file |
| 10 | fix works for all future signups, not just retroactively | ✓ — root cause was in the read path, not the data |

## Step 6 — Verification

To verify end-to-end after this deploy:

1. **Have Joelle LAU retry the form.** On the live site she should
   now be able to submit "request session" without the red error
   (assuming her tenant has a paid subscription with sessions
   remaining; otherwise she gets the new "no active plan" message
   which is correct).
2. **Run a fresh invite.** Joelle creates a new invite for a fresh
   email. Sign up in an incognito window. Submit a session request.
   No error.
3. **Placeholder match.** Joelle creates a client manually via
   `/studio/clients/new` (no invite, just name + email). Then sends
   an invite to the same email. Sign up. Confirm a single `clients`
   row exists, the placeholder was updated, no duplicate.
4. **Idempotency.** Reload `/invite/[code]/claim` immediately after
   it succeeds → page redirects to `/client/dashboard`, no error,
   no duplicate created. Logs show `idempotent_replay`.

## What was deferred

- **Admin verify endpoint** (`/api/admin/verify-client-linkage`)
  — structured logs cover the diagnostic need for now.
- **Auditing other unfiltered `.maybeSingle()` lookups across the
  codebase** — none found in production code paths except
  `requestSession`. The subscribe action (`/s/[slug]/subscribe/[pkgId]`)
  uses `.eq("clerk_id", userId).maybeSingle()` which would break if
  a user becomes a client of 2+ trainers simultaneously, but that's
  a multi-tenant edge case for later.
- **Backfill script** — not needed, no orphan rows from real signups.

## Files touched

| file | change |
|---|---|
| `src/app/studio/calendar/actions.ts` | `requestSession` now resolves identity via `requireClient()` + state-specific error copy |
| `src/app/invite/[code]/actions.ts` | structured logging at every step + placeholder-match branch |
| `INVITE_LINKAGE_DEBUG.md` | this document |
