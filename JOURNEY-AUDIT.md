# User-Journey Audit — Form Studio

Started: 2026-05-06.

This audit walks each of the six journeys end-to-end on mobile (375px)
and desktop (1440px), in both roles, **without writing any fixes**.
Findings get grouped by shared root cause before any code changes.

The standard each journey must satisfy:

1. **End-to-end correctness** — no step breaks, dead-ends, loses data.
2. **Cross-platform consistency** — mobile + desktop both work.
3. **State persistence** — refresh, sign-out, sign-back-in, switch
   device → resume cleanly.
4. **Recoverability** — every error has a forward path.

Severity legend: 🔴 blocker · 🟠 broken · 🟡 rough · 🟢 note

Status: `[ ]` open · `[~]` in progress · `[x]` fixed and verified

The audit is read against the live code at HEAD on `main`. Manual
end-to-end walkthroughs at 375px and 1440px will validate (or expand)
this set after fix-priority sign-off.

---

## Journey 1 — Trainer signup → first client onboarded

### Mobile + Desktop, trainer

- 🟠 **[ ] J1-1 Onboarding form is missing fields the spec calls for.**
  `src/app/onboarding/onboarding-form.tsx` collects only `slug`,
  `displayName`, `bio`, `timezone` (hidden, auto-detected from
  `Intl.DateTimeFormat`). The spec asks for **profile image, cover
  image, and a country-based timezone dropdown**. None of those exist.
  Trainers can't set their public-page imagery during signup; they
  also have no way to confirm/correct the auto-detected timezone.
- 🟠 **[ ] J1-2 Slug validation rejects digits and hyphens silently.**
  `src/lib/tenancy.ts:isValidSlug` uses `/^[a-z]+$/` — no digits, no
  hyphens, no underscores. The form hint says "Letters only,
  lowercase. 3–32 characters" but the **server returns the same generic
  copy** ("That subdomain isn&rsquo;t available.") for invalid format,
  reserved-word collision, and taken-slug. The trainer can't tell
  which is wrong. Also, "no digits" is over-restrictive — common
  patterns like `joelle1` or `joelle-fitness` are blocked without
  documentation.
- 🟠 **[ ] J1-3 Onboarding redirect lands the user on a host that
  can't resolve on Vercel preview deployments.** `onboarding-form.tsx:45`
  forces `window.location.href = ${slug}.${rootDomain}/studio/dashboard`.
  When `NEXT_PUBLIC_ROOT_DOMAIN=form-studio-beta.vercel.app`, there is
  no wildcard DNS / Vercel alias for `${slug}.form-studio-beta.vercel.app`
  — the trainer hits a 404 on the very first redirect. The /me router
  (line 32) takes the *opposite* approach and redirects to
  `/studio/dashboard` on the apex. Two paths, two outcomes,
  inconsistent.
- 🟡 **[ ] J1-4 First-time empty state is shallow.** `FirstTimeNudges`
  in `studio/dashboard/page.tsx:388` only suggests "invite your first
  client". The spec asks for guidance through *create package → build
  one exercise → build one template → invite client*. A new trainer is
  pushed straight to inviting a client with nothing prepared.
- 🟡 **[ ] J1-5 Onboarding page padding is `py-16` (64px) on mobile.**
  Over the user's 24-px-max baseline; the title + hint occupy most of
  the viewport before the first input shows.
- 🟡 **[ ] J1-6 No back button on `/onboarding`.** A trainer who lands
  there and changes their mind can only sign out — there's no
  "← back" or escape.
- 🟢 **[ ] J1-7 Idempotency on retry is good.** The action checks for
  an existing trainer row keyed by `clerk_id` and short-circuits to
  `ok` — refreshes mid-onboarding don't double-create. ✓
- 🟡 **[ ] J1-8 Refresh during signup loses the form values.** The
  form is `useForm` client-state only. A page refresh wipes
  `displayName` / `bio`. Nothing persists to a draft row.

### Cross-cutting

- 🟠 **[ ] J1-9 Slug error copy uses HTML entity `&rsquo;`** in a
  user-visible error message (`actions.ts:41`) — renders as the
  literal string in some flows where it isn't HTML-decoded (e.g. the
  inline form error). Confirmed in `setError`-path rendering.

---

## Journey 2 — Trainer's daily / weekly use

### Mobile + Desktop, trainer

- 🟠 **[ ] J2-1 Subscriptions still use the legacy `payment_status`
  column; the new `subscriptions.status` column is dead code.** The
  package-model migration (2026-04-30) added
  `subscriptions.status` (`active|pending|expired|cancelled`) plus a
  partial unique index `WHERE status = 'active'`. **No write path
  updates this column.** `markSubscriptionPaid`, `assignPackage`, the
  invite-claim, the public subscribe action — none of them set
  `status`. The "one active sub per client" guarantee is unenforced;
  every action paths through `payment_status` instead.
- 🟠 **[ ] J2-2 `cancelSession` has no trainer authorization check
  when `actor === 'trainer'`.** `src/app/studio/calendar/actions.ts:166`
  reads the session row but never confirms the caller's `tenant_id`
  matches the session's. A signed-in user from another tenant could
  cancel any session by ID. RLS would block direct DB access, but the
  action uses the **admin client** which bypasses RLS. **Server-side
  authorization gap.**
- 🟠 **[ ] J2-3 No automatic "completed" / "expired" flip for
  subscriptions.** A package whose duration ended (`end_date < today`)
  or whose `sessions_remaining = 0` stays in `payment_status='paid'`.
  No background job, no on-read flip. Spec 6D: "Last session is
  completed → package status becomes 'completed'." Not implemented.
- 🟠 **[ ] J2-4 Calendar shows just the city, not the country +
  offset the spec asks for.** `prettyTimezone("Asia/Dubai") → "Dubai"`.
  Spec calls for "Lebanon · GMT+3". One-line fix in `lib/timezone.ts`,
  but it appears in calendar header + dashboard.
- 🟡 **[ ] J2-5 No "preview as client" mode.** Spec mentions
  "Switching between trainer view and client view (preview as) works
  without breaking state" — the feature does not exist. Trainers
  cannot impersonate one of their clients to QA the experience.
- 🟡 **[ ] J2-6 Bulk operations missing.** Spec asks "multi-select
  clients, multi-archive exercises". Library has selection UI but
  multi-archive isn't wired. Clients page has no bulk actions.
- 🟡 **[ ] J2-7 Filter / sort don't persist across navigation.**
  ClientsList `query` / `sort` / `needsAttentionOnly` are local state.
  Navigate to a client detail and back — every filter resets.
- 🟡 **[ ] J2-8 No notifications fire on most state transitions.**
  `markSubscriptionPaid` sends an email ✓. But: session cancel,
  session approve, in-app extra workout request, package renewal soon
  — no emails, no in-app notifications. Cross-cutting with J6.
- 🟢 **[ ] J2-9 Dashboard action feed correctly aggregates** pending
  payments, session requests, awaiting-log, in-app upgrade asks (post
  the `client_requested` model rewrite), renewing subs, fresh notes.
  Recent rewrite holding up. ✓
- 🟢 **[ ] J2-10 Calendar week query** uses correct trainer-tz Monday
  anchor via `weekRange()` + `fromZonedTime`. ✓ on the timezone math.
- 🟡 **[ ] J2-11 No video upload for exercises in the studio
  library.** Library has `add exercise` flow but I have not verified
  the upload path lands the file in storage, generates a thumbnail,
  or streams correctly on iOS Safari. Marked as a gap to manually
  walk before sign-off; could be 🟠 if broken.

### Cross-cutting

- 🟠 **[ ] J2-12 SessionRow ⋯ menu uses `position: absolute` inside
  potential `overflow-x-auto` containers.** Same root cause that
  clipped the SubscriberList popover before we portaled it. Mobile
  list view stacks now, so the issue is reduced but not gone for
  desktop session-rail kebabs.

---

## Journey 3 — Client invite → first session attended

### Mobile, client (primary)

- 🔴 **[ ] J3-1 No online-payment handoff at all.** The invite-claim
  action (`src/app/invite/[code]/actions.ts:118`) hardcodes
  `payment_method: 'manual'`, ignoring the package's `payment_mode`.
  Same in the public subscribe action (`s/[slug]/subscribe/[pkgId]/
  actions.ts`). If the trainer set the package to `online`, the
  client never sees Stripe / Tap — they just get "trainer will
  confirm payment" copy. **Online checkout is not implemented.**
- 🟠 **[ ] J3-2 Subscription `end_date` math is wrong on invite-
  claim.** Lines 100–102 add `setMonth(+1)` regardless of the
  package's `duration_days`. A 60-day package becomes 30-day. Spec
  step 11: "Sees their package status (8 sessions, 60 days, payment
  pending or active)" — the displayed validity will be wrong.
- 🟠 **[ ] J3-3 Client lands on `/client?welcome=1` after public
  subscribe, but the welcome banner copy assumes invite flow.**
  `src/app/client/welcome-banner.tsx` content is generic but wasn't
  audited against the public-subscribe path's expectations.
- 🟠 **[ ] J3-4 Sign-up `redirect_url` after public subscribe is
  broken.** `s/[slug]/subscribe/[pkgId]/page.tsx:39` builds
  `?redirect_url=/subscribe/${pkgId}` — but that path only works
  through the trainer subdomain rewrite (`/s/{slug}/subscribe/...`).
  Clerk redirects back to **the apex** post-signup; `/subscribe/...`
  resolves to a 404. The user is dropped at a dead end.
- 🟡 **[ ] J3-5 The phone number is required** in the invite-claim
  form but nowhere in the public-subscribe path. The trainer ends up
  with a `clients` row missing `phone` for any public-subscribe
  client. Cross-cutting with the trainer's "client detail" expectations.
- 🟡 **[ ] J3-6 No reminders or confirmation email fire** at:
  successful claim, payment marked paid (✓ this one fires), day-
  before-session, post-session. The spec lists 13 + 14 (reminder day
  before) explicitly. Not implemented.
- 🟢 **[ ] J3-7 Beta gate cookie** is set on invite-claim so post-
  claim navigation doesn't bounce to /beta. ✓ Good. (Caveat: with
  current `BETA_CODES` containing only Joelle + Jad, the cookie
  value chosen is the *first* code, not necessarily the trainer's.
  Works but a bit weird semantically.)
- 🟡 **[ ] J3-8 Client cannot find the trainer's contact info.** Spec
  asks for trainer email/phone visible somewhere on the portal.
  ProfileSection shows trainer name + studio chrome, no contact.
- 🟡 **[ ] J3-9 Public subscribe page padding is `py-16`** — same
  mobile issue as onboarding.

### Desktop, client

- 🟢 Largely the same. The client portal layout already collapses
  cleanly to single-column.

### Cross-cutting

- 🟢 RLS scoping (clients only see their own trainer) appears
  correct via `requireClient()` resolving by `clerk_id` + tenant
  cookie. Confirmed via the multi-trainer `/client/pick` path.
- 🟡 **[ ] J3-10 `client_profile_fields` defaults to `{ weight: true }`
  only.** All other log fields off. Spec step 17 says "Optionally:
  client logs their own metrics (weight, mood, cycle if enabled)" —
  weight works, but if the trainer hasn't toggled the others on, the
  client sees a single field. No copy explains this.

---

## Journey 4 — Client's ongoing use

### Mobile, client

- 🟠 **[ ] J4-1 `requestSession` (the regular request, not the $3
  add-on) doesn't enforce `auto_renew=false` or check sub balance
  via the unique active-sub index.** It checks `payment_status='paid'
  AND sessions_remaining > 0` directly. Once we wire
  `subscriptions.status` (J2-1), this needs to migrate.
- 🟠 **[ ] J4-2 Client cancellation cutoff is computed in trainer-tz
  ✓ but the UI shows the formatted time in client-tz** (the calendar
  section uses `me?.timezone ?? trainer?.timezone`). That mismatch is
  intentional but the cancel-modal copy never tells the client which
  tz the cutoff is in. Spec: "Confirmation modal: 'Cancel session at
  [Trainer's local time]?'" — currently the modal is just a native
  `confirm("Cancel this session?")`. No timezone disclosure, no
  policy disclosure ("[restore credit / not restore credit]").
- 🟠 **[ ] J4-3 In-app session player doesn't have a working timer
  per spec.** I have not verified `client/sessions/[id]` has start /
  pause / complete controls + per-set rest timers. The session page
  exists; the runtime player flow needs a manual walk. Marked
  pending.
- 🟠 **[ ] J4-4 Mobile Safari video playback** for exercise demos
  — not validated. Common iOS gotcha (autoplay-with-sound bans, HLS
  vs. mp4 differences). Test against a real device.
- 🟠 **[ ] J4-5 Progress photos: schema is ready (`client_logs.value`
  jsonb) but no UI surface to capture or view them.** Listed in
  TASKS.md "Deferred" already.
- 🟠 **[ ] J4-6 No notification when package is 7 days from ending.**
  Spec step 11. Trainer sees "renewal_soon" feed item, **client sees
  nothing** on their portal proactively.
- 🟡 **[ ] J4-7 `fmtRelative` / "last seen" date language** not
  audited for tone consistency.

### Desktop, client

- 🟢 Calendar list collapses correctly per the post-mobile-batch-1
  fix. Tabular layouts work.

### Cross-cutting

- 🟠 **[ ] J4-8 Refund flow for declined / unprescribed $3 add-ons.**
  Spec 5C step 8 asks "refund flow if trainer declines or fails to
  prescribe within X days." Not implemented; payment row stays
  `pending` indefinitely if the trainer ignores the request.

---

## Journey 5 — Payment flows

### 5A — Manual / cash subscription

- 🟢 Pending state visible on both sides (trainer dashboard action
  feed + client profile section). ✓
- 🟠 **[ ] J5A-1 No status update.** Aligns with J2-1 — `status`
  column never set.
- 🟢 Email to client on `markSubscriptionPaid`. ✓

### 5B — Online subscription

- 🔴 **[ ] J5B-1 Not implemented.** No Stripe Connect, no Tap, no
  webhook handler, no checkout redirect. The package field
  `payment_mode='online'` exists but no path consumes it. Listed in
  the Phase 2 deferred section. **This is a known gap; flagging as
  blocker because the spec's J5 explicitly tests it.**
- 🔴 **[ ] J5B-2 No Stripe Connect for trainers.** The platform can't
  collect a fee from trainer→client transactions. Phase 2 work.
- 🔴 **[ ] J5B-3 No webhook idempotency code path** because the
  webhook receiver doesn't exist yet.

### 5C — $3 in-app session add-on

- 🟢 **[ ] J5C-1 Action creates session + pending payment.** ✓
  (`requestExtraInAppSession` shipping last week).
- 🟠 **[ ] J5C-2 Payment never actually charges.** No Stripe / Tap.
  Same root as J5B. The $3 row stays `status='pending'` until
  someone manually flips it. No "client paid" confirmation back to
  the user.
- 🟠 **[ ] J5C-3 No refund flow.** Per J4-8.
- 🟢 Approve flow (`approveSessionRequest`) correctly skips package
  deduction for `client_requested`. ✓
- 🟡 **[ ] J5C-4 No expiry on the request.** A trainer who ignores
  the ask leaves the session as `requested`+ `pending payment`
  forever.

### Cross-cutting (5)

- 🟠 **[ ] J5-5 Currency assumed USD everywhere.** No currency col
  on `packages` or `payments`. Display hardcodes `$X usd`. For the
  Lebanon market (Joelle's persona) this is fine for v1 but flagged.

---

## Journey 6 — Cancellation flows

### 6A — Client cancels before cutoff

- 🟠 **[ ] J6A-1 Confirm modal is a browser `confirm()`** — no
  timezone, no policy disclosure (J4-2). Should be a real dialog
  per spec.
- 🟢 Credit math: `+1` to `sessions_remaining` when policy=credited.
  ✓
- 🟠 **[ ] J6A-2 No notification to trainer.** Cancellation is silent.

### 6B — Client tries after cutoff

- 🟢 Cancel button is wrapped with `s.canCancel` check that uses
  `canClientCancel(scheduledAt, trainerTz)`. ✓ Server enforces too.
- 🟡 **[ ] J6B-1 Mobile cancel-disabled UI** shows strikethrough +
  "cutoff was midnight yesterday — message your trainer." Acceptable
  but doesn't link to the trainer's contact info (J3-8).

### 6C — Trainer cancels

- 🟠 **[ ] J6C-1 No authorization** (J2-2).
- 🟠 **[ ] J6C-2 No notification to client.**
- 🟢 Always credits regardless of policy. ✓

### 6D — Package expires

- 🟠 **[ ] J6D-1 No automatic transition.** Sub stays
  `payment_status='paid'` after `sessions_remaining` hits 0 or
  `end_date` passes. The dashboard action feed shows
  "renewal_soon" *if* `sessions_remaining > 0`, but once it's 0 the
  client just sees "0 sessions left" with no follow-up.
- 🟠 **[ ] J6D-2 No "subscribe again" UX on the client portal** when
  package ends. ProfileSection's empty state says "Ask {trainer}
  for an invite" — but the client should be able to renew themselves
  without a fresh invite (the public subscribe page works for any
  package).

### 6E — Mid-package cancellation

- 🔴 **[ ] J6E-1 Policy not decided, no UI, no flow.** Spec
  explicitly asks "Decide and document the policy." Currently a
  client who wants to cancel mid-package has no path other than
  asking the trainer. Need policy decision before fix.

### Cross-cutting (6)

- 🟠 **[ ] J6-3 In-app surcharge payment ($3) doesn't refund on
  cancellation.** If a `client_requested` in-app session is
  cancelled, the $3 stays in `payments` as if collected. Aligns with
  J4-8.
- 🟢 Cancelled sessions remain in DB with `status='cancelled'`,
  visible in past list. ✓
- 🟢 Cancellation cutoff math uses trainer-local midnight-of-day-
  before. ✓ Verified in `clientCancellationCutoff`.

---

## Shared root causes (preview — to be expanded after sign-off)

Many findings collapse onto a few underlying gaps:

1. **`subscriptions.status` is dead code.** Touches J2-1, J5A-1, J6D-1,
   J6D-2, partial-unique-index enforcement.
2. **No online payment integration (Stripe Connect / Tap).** Touches
   J3-1, J5B-1/2/3, J5C-2, J5-5 (currency).
3. **Notifications missing on most transitions.** Touches J2-8,
   J3-6, J6A-2, J6C-2.
4. **Server-action authorization gaps** when admin client is used.
   Touches J2-2 / J6C-1.
5. **Subscription-lifecycle automation missing** (expiry transition).
   Touches J6D-1, J6D-2.
6. **Client-side cancel UX uses native `confirm()`** instead of a
   real dialog with disclosure. Touches J4-2, J6A-1.
7. **Onboarding form scope** — missing fields, slug validation copy,
   subdomain redirect inconsistency. Touches J1-1/2/3/4/5/6/8.
8. **Refund / unfulfilled $3 lifecycle** — touches J4-8, J5C-3, J5C-4,
   J6-3.
9. **Public-subscribe path inconsistencies** with invite-claim
   (phone capture, redirect URL, end-date math). Touches J3-2/4/5.
10. **`prettyTimezone` returns city only.** Single-line fix; touches
    J2-4 + every page that displays a tz.

## Out-of-scope structural concerns flagged for discussion

These need design decisions before any code is written:

1. **Mid-package client cancellation policy (J6E-1).** Policy: full
   refund? Pro-rated? Disallowed? No code until decided.
2. **Online payment provider choice + integration scope (J5B).**
   Stripe Connect vs Tap vs both. Beirut / Dubai market constraints.
   Significant body of work.
3. **Mobile month-view pattern (E2 from MOBILE-AUDIT).** Still
   pending.
4. **Trainer "preview as client" mode (J2-5).** Adds an impersonation
   primitive to the auth/permission model.

---

## Pre-sign-off questions for the user

Before any fixes:

1. **Online payments scope.** Is this audit's expectation that we
   build Stripe Connect + Tap now, or is the spec testing what *would*
   need to be built and we keep it Phase 2? (J5B blockers depend on
   this.)
2. **Mid-package cancel policy (J6E).** Pro-rated / full / disallowed?
3. **Notification channels.** Email-only, or email + WhatsApp?
   (Resend is wired; WhatsApp is not.)
4. **Onboarding scope.** Do we add image uploads + country tz dropdown
   *now* as part of this audit's fixes, or split that into its own
   pass?

---

(After sign-off: root-cause fix plan, per-fix commits, then re-walk
each journey with an "After" section appended per finding.)
