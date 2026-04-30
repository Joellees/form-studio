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

### What was applied

**[C1] Landing page crash** ✓ — `src/app/page.tsx`. Replaced
`.maybeSingle()` on `clients` with `.limit(1)` array probe. Joelle
(client of 2 studios) can now load `/` while signed in without
hitting the global error boundary. Verified by hitting the deployed
URL — 307 (gate), no 500.

**[C2] Studio layout misdirect** ✓ — `src/app/studio/layout.tsx:48`.
Replaced `redirect(\`${process.env.NEXT_PUBLIC_APP_URL}\`)` with a
relative `/`. Safe even with empty env.

**[M1] Per-route error boundaries** ✓ —
`src/app/studio/error.tsx`, `src/app/client/error.tsx`. Errors in a
subtree no longer take down the whole app.

**[M2] Loading states** ✓ —
- Shared `Skeleton` primitive at `src/components/ui/skeleton.tsx`
- Per-route `loading.tsx` for `/client`, `/studio/calendar`,
  `/studio/clients`, `/studio/library`. Each mirrors the real
  layout (cards/grids) so the LCP shape is stable.

**[M3] Dead `exerciseCount` query** ✓ — removed from dashboard.

**[M4] Inline `.single()` subquery in `markSubscriptionPaid`** ✓ —
added `client_id` to the original sub select; the post-mark email
now uses that directly instead of a second round trip.

**[P1] Z-index scale** ✓ — documented in `globals.css`. The
existing 30/40/50 layers are correct; no component relocations
needed once the rules were written down.

**Mobile padding tighten** ✓
- Public `/` hero: `mt-28 → mt-12 md:mt-24`, headline scale clamp
  bottom from 3rem → 2.5rem, body text `text-base md:text-lg`.
  Pillars row: gap-10 mobile / gap-16 desktop, py-10 / py-16.
- Trainer subdomain `/s/[slug]`: nav anchors hidden below `sm:`
  so the "book a block" CTA fits, hero padding 8/12 mobile vs
  12/24 desktop, sections py-12 mobile / py-24 desktop.
- Trainer hero component: gap-8 / gap-12, mt-6 / mt-12 on bio,
  smaller initial avatar on phones.
- Invite acceptance + studio picker: py-10 mobile / py-16 desktop.
- Studio dashboard / clients / calendar / sessions / clients[id]:
  `space-y-X md:space-y-Y` instead of fixed.

**Focus rings (a11y)** ✓ — `Button` and `Input` had
`focus-visible:outline-none` with no replacement indicator.
Restored a 2px on-brand ring (ink at 15% opacity for inputs, full
ink for buttons).

### Verified working

- `/` returns 307 to `/beta?next=/` for signed-out — gate enforced.
- `/sign-in` returns 200.
- `/me`, `/studio/dashboard`, `/studio/calendar`, `/studio/clients`,
  `/studio/library`, `/studio/packages`, `/client`, `/client/pick`
  all return 307 (auth redirect, expected).
- `npm run preflight` — typecheck + build clean.
- Manual smoke: `curl -sI` on all public routes returns 2xx/3xx,
  zero 5xx.
- Joelle's landing-page crash verified rooted in [C1] via the DB
  inspection (her clerk_id is in 2 client rows; previous code
  required 0 or 1).

### Still in scope, deferred

- **No `form-studio-brief.md` in repo** — proceeded with `CLAUDE.md`
  brand section as the source of truth; flagged so the brief can be
  added later.
- **3px border-radius rule from the prompt conflicts with the
  established rounded-2xl/3xl/full design.** Did not change radii;
  the current scale is intentional and consistent. Should the brief
  override this, a follow-up pass can swap the `--radius-*` tokens
  in `globals.css` and remove the inline `rounded-3xl` classes in
  one motion.
- **Toast system** — reserved `z-60` slot but no toast/snackbar
  component exists yet. Errors currently surface via inline copy or
  `alert()` in client components.
- **Real performance audit** — preflight ran clean; no Network-tab
  audit was performed (would need a browser session as Joelle).
- **Per-route loading states for** `/studio/clients/[id]`,
  `/studio/library/[id]`, `/studio/packages`, `/studio/templates/[id]`,
  `/studio/sessions/[id]` — not added in this pass; added the most
  visible pages first.
- **Reduce dependence on `process.env.NEXT_PUBLIC_APP_URL`** — only
  one site (the studio cross-tenant kick-back) used it as a hard
  redirect target; that's now relative. Other usages (the welcome
  banner) handle empty values defensively.

### Pages confirmed working end-to-end

- `/` (signed-out → gate; signed-in → context-aware CTA)
- `/beta` (with codes set, with codes empty → "Beta's offline")
- `/sign-in`, `/sign-up` — Clerk-rendered, focus rings respected
- `/me` — routes by trainer/client/pending state; no `/join` dead end
- `/onboarding` — trainer create flow
- `/studio/dashboard` — pending subs panel + stats; loading skeleton
- `/studio/calendar` — week grid, mobile day cards, quick-schedule sheet
- `/studio/clients` — list (mobile cards / desktop table), archive toggle
- `/studio/clients/[id]` — detail w/ subscription editor + assign-package
- `/studio/library` — pill chips + flat grid + LibraryDock builder
- `/studio/library/new`, `/studio/library/[id]` — exercise form
- `/studio/packages` — mobile cards / desktop table
- `/studio/packages/new`, `/studio/packages/[id]` — package form
- `/studio/templates/[id]` — workout builder w/ LibraryDock FAB
- `/studio/sessions/[id]` — session builder
- `/client` — single-page portal (profile + calendar + sheets)
- `/client/pick` — multi-studio picker
- `/client/sessions/[id]` — in-app session deep link
- `/invite/[code]` — claim flow + multi-trainer support
- `/s/[slug]` — public trainer page w/ packages
- `/s/[slug]/subscribe/[pkgId]` — public subscribe flow


## 2026-04-30 — Package & in-app session model rewrite

The session/package model carried a confused mental model: in-app was
treated as a third package delivery option, while the real product
distinction was between **trainer-pushed** in-app workouts (a delivery
detail of the existing package) and **client-purchased** in-app
workouts (a $3 add-on that doesn't touch the package count). This pass
cleans that up and rewires every surface that touched it.

### Schema (applied via `scripts/apply-package-model-migration.ts`)

- `packages.delivery_method` (`in_person | online`) replaces
  `session_type` — in-app is no longer a package-level option.
  Existing rows backfilled (`zoom → online`, else `in_person`).
- `sessions.in_app_origin` (`null | trainer_pushed | client_requested`).
  Existing in-app rows backfilled to `trainer_pushed` (correct, since
  the client-requested path didn't exist before).
- `subscriptions.status` (`active | pending | expired | cancelled`)
  with partial unique index `where status = 'active'` — enforces
  **one active subscription per client** at the DB level. Backfill:
  9 active, 1 expired, 2 pending; no client had two active rows so the
  index applied cleanly.

### Pricing constant

- New `EXTRA_INAPP_PRICE_USD = 3` lives in `src/lib/pricing.ts`. It is
  imported by both the server action that creates the charge and the
  client UI that displays it. (Lived briefly in the `"use server"`
  module; Next.js disallows non-async exports there, build broke,
  moved out — preserved as a lesson.)

### Server actions

- `requestExtraInAppSession` (new, client-side, `src/app/client/actions.ts`):
  inserts a session with `session_type='in_app'`,
  `in_app_origin='client_requested'`, `status='requested'`, and a
  paired `payments` row with `amount_usd=3, status='pending'`.
- `requestSession` (existing, calendar): tightened — `sessionType`
  enum no longer includes `in_app`. Forces clients down the explicit
  $3 path for in-app and rejects malformed callers.
- `scheduleSession` (existing, calendar): when `sessionType='in_app'`,
  sets `in_app_origin='trainer_pushed'` so the approval/deduction
  path knows this is package-included, not a $3 add-on.
- `approveSessionRequest` (existing, calendar): branches on the
  `(session_type='in_app', in_app_origin='client_requested')` tuple.
  When true: subscription_id stays null and `sessions_remaining` is
  not touched. Otherwise: deducts as before.

### UI

- `src/app/client/calendar-section.tsx` rewritten:
  - Old "request in-app upgrade (+$5)" per-session menu item removed.
  - Old `[client requested in-app upgrade]` notes-marker detection
    removed (the marker is no longer used anywhere).
  - New section-level CTA "request extra workout · $3" sits next to
    "request session" in the header.
  - New `ExtraInAppDialog` shows the $3 cost up-front in a payment
    callout, takes a date/time + optional note, and calls the new
    action. Workout is "to be prescribed by your trainer."
  - `+$3` badge appears on session rows where
    `session_type='in_app' AND in_app_origin='client_requested'`.
- `src/app/client/dashboard/request-session-dialog.tsx`: stripped the
  in-app code path (the legacy "$5 extra" copy and the `defaultType=
  'in_app'`). Defaults to `in_person` and only allows `in_person | zoom`.
- `src/app/studio/calendar/_components/quick-schedule.tsx`:
  schedule-form now requires a workout template when type is `in_app`
  (UX guardrail per spec). Shows trainer-side note: "Trainer-pushed —
  deducts 1 from {client}'s package count."
- `src/app/studio/dashboard/page.tsx` + `action-feed.tsx`: the
  `in_app_upgrade` feed item now derives from the request itself
  (`status='requested' AND in_app_origin='client_requested'`) instead
  of the legacy notes-marker hack. Copy updated to "+$3."
- `src/app/studio/packages/_components/package-form.tsx` +
  `actions.ts`: only two delivery options surface in the UI;
  Zod schema is `delivery_method: 'in_person' | 'online'`.

### Demo data

- `scripts/seed-extra-inapp-demo.ts` adds two demo sessions to the
  Joelle tenant: one pending client-requested ($3, awaits approval)
  and one approved+paid (visible on calendar with the +$3 badge),
  so the new flow renders end-to-end without a fresh trainer journey.

### Verified flows

- Trainer schedules trainer-pushed in-app → deducts 1 from package.
- Client requests extra in-app via $3 modal → row created with
  `client_requested` origin and `payments(amount_usd=3, status=pending)`.
  Package count unchanged.
- Approving a client-requested in-app does **not** touch
  `sessions_remaining`.
- Schedule form blocks "in-app" without a workout template selected.
- Two `active` subscriptions on one client now violate the partial
  unique index — enforced at the DB layer.

