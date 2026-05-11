# Mobile Audit — Form Studio

Date: 2026-05-11.

Single-pass mobile audit and fix across every surface. Builds on top
of the earlier `MOBILE-AUDIT.md` (dated 2026-05-01) which covered
the first batch — calendar list view, 44px touch targets, safe-area,
spacing — by closing the categories that pass needed but didn't ship.

This document is the post-pass record. For each surface: routes
reviewed, issues found, fixes applied, items deferred.

---

## Stack reference

- **Tailwind v4** with `@theme` tokens in `globals.css`. Default
  breakpoints (`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).
- **shadcn-style primitives** in `src/components/ui/*` — Button,
  Input, Card, Table, Badge, Select. Forms use react-hook-form.
- **Viewport / PWA** — `viewportFit: "cover"`, themeColor, manifest
  + service worker registered.

---

## Surfaces and routes reviewed

| Surface | Routes |
|---|---|
| Marketing | `/`, `/s/[slug]`, `/s/[slug]/subscribe/[pkgId]`, `/invite/[code]`, `/beta` |
| Auth | `/sign-in`, `/sign-up`, `/onboarding`, `/me` |
| Studio (trainer) | `/studio/dashboard`, `/studio/clients` (+ `new`, `[id]`), `/studio/packages` (+ `new`, `[id]`), `/studio/calendar` (+ `new`), `/studio/library` (+ `new`, `[id]`), `/studio/templates` (+ `new`, `[id]`), `/studio/sessions/[id]` |
| Client portal | `/client`, `/client/calendar`, `/client/dashboard`, `/client/logs`, `/client/pick`, `/client/sessions/[id]` |

---

## Already shipped earlier in the session (recap)

These were closed in prior commits and are not redone here:

- Sticky header / hamburger nav drawer — portalled out of header's
  `backdrop-blur` containing block so it fills the viewport on tap.
- Calendar week view — vertical day list with collapsed empty days.
- Calendar 2-weeks + month views — iOS-pattern mini grid with a
  selected-day detail panel beneath, dot indicator on busy days.
- Clients list — single compact card per client on mobile, status
  badge pinned top-right of identity row, package + last-seen merged
  into one muted detail line. Killed the 4-row vertical stack.
- Library toolbar — `add exercise` + `select` / `add to workout`
  side-by-side on mobile, search on its own row.
- Dashboard action feed — `ContextRow` content wraps on mobile,
  chip aligns top when content goes to two lines.
- 44px touch targets — calendar view-switcher, prev/next nav,
  dashboard QuickActions pills, action-feed buttons.
- Safe-area padding on studio shell and client shell `<main>`
  with `env(safe-area-inset-bottom) + 5rem`.
- Packages table `SubscriberList` popover — portalled out of
  `overflow-x-auto` table wrapper so the full client list renders.

---

## This pass — global mobile-native primitives

Added to `globals.css` in a single `@layer base` block:

1. **Kill the iOS 300 ms tap delay and the gray tap-highlight flash**
   on every interactive element (`a, button, [role=button], input,
   select, textarea, label`) — `touch-action: manipulation` +
   `-webkit-tap-highlight-color: transparent`. The focus-visible
   ring (already defined) continues to serve as the affordance for
   keyboard users; touchscreen users get visual feedback via
   Tailwind's `active:` utilities on a per-element basis.
2. **16 px minimum font-size on form controls below the `md`
   breakpoint** to suppress iOS Safari's zoom-on-focus. Desktop
   styles unchanged.
3. **`overscroll-behavior-y: contain`** on `body` so pull-to-refresh
   and rubber-band scroll inside a drawer / modal don't propagate
   to the page below.
4. **`min-h-screen` → `min-h-dvh`** via `@supports (min-height:
   100dvh)`. Resolves the 100vh-includes-URL-bar bug on iOS Safari
   where hero pages were rendering taller than the visible viewport.

---

## Issues found and fixed, by category

### Layout

- **Dashboard action-feed rows cut off** at the right edge on
  iPhone SE (375 px). `ContextRow` used `truncate` which hides
  the bulk of "Joanne — 8 sessions · strength + mobility renews
  in 5d · 4 sessions left." → **Fixed** earlier this session by
  switching to `break-words` on mobile, `sm:truncate` from `sm:`
  up.
- **Clients list 4-row vertical stack** with whitespace between
  rows looked unorganized on mobile. → **Fixed** by collapsing
  to a single compact card per client.
- **Calendar 2-weeks + month** had a 7-column desktop grid forced
  onto a 375 px viewport, illegible. → **Fixed** with iOS-pattern
  mini-grid + selected-day detail.
- **Library toolbar** had `add exercise` and `select` each on its
  own mobile row with empty gap between. → **Fixed** by grouping
  them on the same row.
- **Sticky header drawer clipped** to a thin strip when the
  hamburger was tapped — caused by `backdrop-blur` on the header
  creating a containing block for the `fixed` drawer. → **Fixed**
  by portalling the drawer to `document.body`.

### Touch targets

- **Calendar view-switcher pills, prev/next nav, dashboard
  QuickActions, action-feed action buttons** — all bumped to
  `h-11` (44 px). Done earlier in the session.
- **SessionRow ⋯ menu** still at `h-6 w-6` — flagged as a deferred
  follow-up; the kebab is mostly desktop-used.

### Typography

- **Inputs at `text-sm` (14 px) triggered iOS zoom-on-focus.**
  Fixed via the global `font-size: 16px` rule below `md`.
- **Body text — `text-sm` (14 px)** is below the spec's
  16 px primary content minimum. Deferred — bumping body text
  globally is a brand decision (Aesop-of-fitness tone leans on
  the smaller scale). Flagged for the brand owner.
- **Page H1 — `text-3xl md:text-4xl`** (30 → 36 px). Mobile is
  within the spec's 28–32 range. Kept.

### Forms

- **`/onboarding` slug input** — added `inputMode="text"`,
  `autoComplete="off"`, `autoCapitalize="none"`,
  `autoCorrect="off"`, `spellCheck={false}` so the iOS keyboard
  doesn't try to autocapitalize "joelle" or insert a space.
- **`/onboarding` display-name input** — added `autoComplete="name"`,
  `autoCapitalize="words"`.
- **`/studio/clients/new` display-name input** — added
  `autoComplete="off"`, `autoCapitalize="words"`.
- **`/studio/clients/new` email input** — added
  `autoComplete="email"`, `autoCapitalize="none"`,
  `autoCorrect="off"`, `spellCheck={false}`. (`type=email
  inputMode=email` were already set.)
- **`/beta` code input** — added `autoCapitalize="none"`,
  `autoCorrect="off"`, `inputMode="text"` to prevent the
  keyboard auto-capitalizing the first letter of a code like
  `claude-chat-preview`.
- **Package form** — number inputs already use `inputMode="numeric"`
  and `inputMode="decimal"` correctly. No change.
- **Phone input** (invite-generator) — already `type="tel"`,
  `inputMode="tel"`, `autoComplete="tel"`. No change.

### Tables → cards on mobile

- **Packages page** — already `grid gap-3 md:hidden` mobile cards
  + `hidden md:block` desktop table. ✓
- **Clients page** — refactored to single-card mobile layout this
  session. ✓
- **Studio clients/[id] sessions table** — deferred. The table on
  the client detail page is a desktop-style table on mobile.
  Worth a follow-up to either collapse rows into mobile cards or
  to allow horizontal scroll with edge-fade.

### Modals + bottom sheets

- **Bottom-sheet pattern below `md`**, floating card above —
  already in place for `QuickSchedule`, `RequestSessionDialog`,
  `ExtraInAppDialog`, `CycleDialog`. ✓
- **`SubscriberList` popover** — full-screen overlay on mobile
  deferred. Currently portals to body with positioned fixed
  coords. Functional, but a full-screen sheet would feel more
  native at < 640 px.

### Navigation

- **Top nav** — already collapses to a full-screen hamburger drawer
  below `md`. Avatar always visible. ✓

### Safe areas

- **`min-h-screen` → `100dvh`** via `@supports`. ✓
- **`env(safe-area-inset-bottom)` reserved on studio shell + client
  shell `<main>`**. ✓
- **Mobile nav drawer** padded for `safe-area-inset-top` and
  `safe-area-inset-bottom` so the close button clears the notch
  and the last link clears the home bar. ✓

### iOS Safari-specific

- **300 ms tap delay** killed via `touch-action: manipulation` on
  all interactive elements globally. ✓
- **`-webkit-tap-highlight-color: transparent`** on all interactive
  elements. ✓
- **100vh bug** addressed via `@supports (min-height: 100dvh)`
  override. ✓
- **Body scroll lock when modal open** — the nav drawer sets
  `body.style.overflow = "hidden"` on open. Other modals
  (`QuickSchedule` etc.) use a fixed scrim that covers the page
  but don't lock body scroll. Acceptable on iOS because the scrim
  catches drag, but worth tightening — deferred.

### Android Chrome-specific

- **Address bar resize jank** — addressed by switching to `100dvh`
  where it matters. ✓
- **Soft keyboard pushes content** — pages with primary CTAs at
  the bottom rely on the auto-scroll into view when the input is
  focused. Deferred: explicit `visualViewport` listeners aren't
  wired.

---

## Items deferred (out of scope for this pass, flagged for follow-up)

In order of impact:

1. **`/studio/library` virtualized scroll** — exercise library has
   100+ entries (Joelle has 113). The grid renders all at once.
   On a low-end Android device this risks jank. Worth adding
   `react-window` or a virtual list. (Spec asked for "search-first
   interface with virtualized scrolling" — the search is in, the
   virtualization isn't.)
2. **`/studio/clients/[id]` tabbed mobile layout** (Overview /
   Sessions / Packages / Notes). Currently the page is one long
   scroll. Heavy on mobile. Should be a tabbed segmented control.
3. **`SubscriberList` popover → full-screen sheet on mobile**.
4. **`SessionRow` kebab menu → 44 px wrapped tap region** on mobile.
5. **`/studio/billing/locked` and `/studio/billing/*`** — these
   pages don't exist yet (billing is a separate prompt). The
   spec asks them to be premium-feeling on mobile; when the
   billing prompt builds them, ensure currency segmented control
   is thumb-reachable and cards stack vertically.
6. **`/studio/clients/[id]` sessions table** — collapse to cards on
   mobile or add edge-fade horizontal scroll.
7. **Body text minimum 16 px** spec compliance — currently 14 px.
   Brand decision required before bumping.
8. **Pull-to-refresh** on dashboard / clients / calendar — spec
   asks for it; not implemented.
9. **Skeleton loaders** where mobile shows spinners — partially in
   place via `loading.tsx` files for `/client`, `/studio/calendar`,
   `/studio/clients`, `/studio/library`. Coverage worth extending
   to every route.

---

## Quality bar (per Step 0 final note) — mental walk-through

Three pages picked from three surfaces, walked mentally at 375 px:

### 1. `/` (marketing landing)
- No horizontal scroll. Hero `clamp(2.5rem, 9vw, 5.75rem)` =
  40 → 92 px, scales correctly.
- CTA pills `h-12` (48 px) — meets the 44 px target.
- Inputs — none on this page.
- Safe area — `min-h-screen` → `100dvh`. ✓
- Breathing room — generous vertical spacing between hero,
  CTA, pillars. Editorial. ✓
- **Passes.**

### 2. `/studio/dashboard` (trainer overview)
- Sticky header — visible on every scroll. Drawer opens full-screen
  when hamburger is tapped. ✓
- PulseStrip — wraps to two lines on narrow viewports. ✓
- Action feed — chips align top, content wraps to multiple lines,
  long action messages stay readable. ✓
- QuickActions pills — `h-11`, wrap across 2 rows. ✓
- Today rail — single column on mobile (default grid). ✓
- **Passes.**

### 3. `/client` (single-page client portal)
- ProfileSection — name + package status + note-to-trainer.
  Inputs use the global 16 px font-size override.
- CalendarSection — list of sessions, "request session" + "request
  extra workout · $3" CTAs in the header. Buttons `h-11`. ✓
- Past sessions toggle — `show past (N)` chip-style. ✓
- Bottom-sheet dialogs for request flows. ✓
- **Passes.**

---

## Commit summary

This pass commits as:

`feat(mobile): global mobile-native primitives + form input attrs`

Files touched:
- `src/app/globals.css` — added the four global primitives
- `src/app/onboarding/onboarding-form.tsx` — input attributes
- `src/app/studio/clients/new/invite-generator.tsx` — input attrs
- `src/app/beta/page.tsx` — code input attrs
- `MOBILE_AUDIT.md` — this document

Earlier in the session, fixes shipped under their own commits:
calendar mobile layout, clients list cards, library toolbar,
dashboard action-feed wrap, mobile nav drawer portal, sticky
header fix, 44 px touch targets, safe-area padding.

---

## Suggested follow-up tasks, ranked by impact

1. **`/studio/clients/[id]` tabs on mobile** (Overview / Sessions /
   Packages / Notes). High traffic page on mobile, currently
   one long scroll. Estimated effort: 2–3 hours.
2. **`SessionRow` kebab → 44 px tap region on mobile**. Estimated:
   30 minutes.
3. **`SubscriberList` mobile bottom-sheet variant**. Estimated:
   45 minutes.
4. **Pull-to-refresh** on dashboard / clients / calendar.
   Estimated: 1–2 hours with a small library.
5. **Library virtualization** at 100+ exercises. Estimated:
   2–3 hours.
6. **Skeleton loaders** for the remaining routes. Estimated:
   ~30 minutes per route.
7. **Body text size brand decision** — 14 → 15 or 16 px. Estimated:
   structural — needs sign-off.
