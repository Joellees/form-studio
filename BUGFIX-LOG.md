# Bug-fix + Polish Sweep — Form Studio

Started: 2026-04-29.

This log tracks the comprehensive fix pass: investigate, document, fix, verify.
Per the user's instructions: thorough not fast, ten things properly beats thirty things half-way.

## Working notes

- No `form-studio-brief.md` in the repo. I'll use the design tokens from
  `CLAUDE.md` (Palette, Fonts, Voice) as the source of truth. The "3px border
  radius" requirement in the prompt conflicts with the existing rounded-3xl
  cards / rounded-full pills throughout — without the brief I'll preserve
  the existing radius scale (it's intentional and consistent) and flag the
  conflict here. **TODO: get the brief.**

## Severity scale

- **CRITICAL** — page crashes, blocks core flows, data integrity risk
- **MAJOR** — broken UX, layout breakage, console errors that don't crash
- **MINOR** — polish, copy, spacing, hover states

---

## Investigation phase

### DB state (snapshot, 2026-04-29)

- **Trainers** (4): Joelle, Johnny, Laurent, Rand — all `archived_at = null`,
  `subscription_status = "trialing"`. No data corruption, all rows complete.
- **Joelle's identity is dual** — same Clerk ID
  (`user_3Cl58t35DRcojqySnL8TqobTHrV`) appears in:
  - `trainers` (1 row, slug=joelle)
  - `clients` (2 rows: one in her own tenant, one in Laurent's tenant)
- This dual identity is the root cause of the post-login crash. Several
  call sites still assume one Clerk user → one client row, which was
  true before the multi-trainer migration (#0003) but isn't anymore.

### Bugs found

#### CRITICAL

**[C1] Landing page crashes for users with multi-trainer client membership**
- **Where**: `src/app/page.tsx:31`
- **What**: `admin.from("clients").select("id").eq("clerk_id", userId).maybeSingle()`
  — `.maybeSingle()` errors with `PGRST116` when the query returns >1 row.
  Joelle is a client of 2 trainers → 2 rows → crash → `error.tsx` fallback.
- **Symptom**: Joelle sees "Something broke." on the home page after
  signing in. Walking around the app via direct links works (each route
  uses `requireTrainer()` which scopes by `clerk_id` on `trainers` —
  trainers ARE unique per clerk_id). The home page is the broken surface.
- **Fix**: switch to `.limit(1)` array probe.
- **Severity**: CRITICAL — blocks the landing page for the owner.

**[C2] `/studio/layout.tsx:48` redirects to `process.env.NEXT_PUBLIC_APP_URL`**
- **Where**: `src/app/studio/layout.tsx:48`
- **What**: a trainer who somehow lands on another trainer's subdomain
  is bounced to `${process.env.NEXT_PUBLIC_APP_URL}`. If that env var is
  empty or unset the redirect target is `""` which Next.js may treat
  unpredictably. Should be a relative path or origin-aware.
- **Severity**: MAJOR (rare path, but bad failure mode).

#### MAJOR

**[M1] No per-route error boundaries in `/studio/*` or `/client/*`**
- **Where**: only `src/app/error.tsx` exists (global).
- **What**: any error in a studio or client subtree blows up the whole
  app. Per-segment `error.tsx` would isolate failures to that surface
  and let the user retry without a full reload.
- **Severity**: MAJOR.

**[M2] Sparse `loading.tsx` coverage**
- **Where**: only `src/app/studio/loading.tsx`. Missing for `/client`,
  `/studio/calendar`, `/studio/clients/[id]`, `/studio/library`,
  builders, etc.
- **What**: dynamic SSR pages flash blank while server queries run.
- **Severity**: MAJOR (UX, not correctness).

**[M3] Dashboard fetches `exerciseCount` and never uses it**
- **Where**: `src/app/studio/dashboard/page.tsx:15`
- **What**: extra unused server query on every dashboard load. ESLint
  warning, no functional impact, but it's dead work.
- **Severity**: MINOR (perf).

**[M4] `subscriptions/actions.ts:58` does an inline `.single()` subquery**
- **Where**: `src/app/studio/subscriptions/actions.ts:58`
- **What**: the surrounding `markSubscriptionPaid` flow already loads
  the subscription a few lines above but doesn't select `client_id`.
  The fix is to add `client_id` to the original select rather than
  re-fetching mid-statement.
- **Severity**: MINOR (works, but ugly + wastes a round trip).

#### MINOR / POLISH

**[P1] Z-index scale isn't documented**
- header is `z-40`, modals are `z-50`, dropdown backdrops are `z-30`,
  FAB is `z-40`. It works but lacks a documented scale for future
  components to slot into.

**[P2] No `inputMode` on most number / email / tel inputs**
- Already fixed on the package + client-details forms in the previous
  mobile pass; remaining occurrences should follow.

---

## Fix phase

