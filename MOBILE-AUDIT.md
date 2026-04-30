# Mobile-First Audit — Form Studio

Date opened: 2026-05-01.

Walks every page at 320 / 375 / 390 / 414px and grades against the
12-point standard the user issued. Violations are grouped by **type**
so each fix is structural — one shared component or one Tailwind
change covers many pages — instead of page-by-page whack-a-mole.

## Status legend

- `[ ]` — not started
- `[~]` — in progress
- `[x]` — fixed and deployed
- `🚩` — structural concern needing user sign-off before rebuild

---

## Findings, grouped by type

### A. Header / nav (#3, #7, #11)

The studio shell already has a hamburger on mobile and a full-screen
drawer (`src/app/studio/_components/studio-nav.tsx`). It works. Few
gaps:

- `[ ]` **A1** — Drawer link items are `py-4` (44px) which is on the
  edge but acceptable. Trash padding around hamburger button is 44px.
  Confirm 44px on the avatar (`UserButton` defaults to 32px in shadcn —
  check, may need wrapping).
- `[ ]` **A2** — On the **client portal** there's no equivalent shell
  /nav. The /client page is single-page so it doesn't strictly need
  one, but the wordmark + sign-out belong somewhere — currently the
  only chrome is whatever each page renders. (Confirm with user before
  building one.)
- `[ ]` **A3** — Sticky header eats vertical space at scroll on small
  screens. Backdrop blur is fine; just ensure it doesn't stack with
  the page header on /studio/calendar etc.

### B. Above-the-fold density (#1, #2, #10)

Most studio pages render: huge eyebrow → 30–36px h1 → spacing → toolbar.
At 375×667 (iPhone SE) the viewport often shows **just the page header**.

- `[ ]` **B1** — `h1` on calendar / clients / packages / library uses
  `text-3xl md:text-4xl` (30 → 36px). User asks 28–32px on mobile;
  `text-3xl` = 30px is in range. **Tighten the lead-up:** drop the
  `mt-2` after eyebrow on mobile, drop `mt-1` on subtitle. Also drop
  `space-y-6 md:space-y-8` to `space-y-4 md:space-y-8` so toolbar +
  first row appear above the fold.
- `[ ]` **B2** — `<main>` uses `px-5 py-6 md:px-8 md:py-12`. Mobile
  `py-6` (24px) is OK; pair it with safer page-bottom `pb` per #11.
- `[ ]` **B3** — Calendar page: viewbox label + view switcher + nav
  group force the toolbar to wrap on narrow screens. Consolidate.

### C. Tables → cards on mobile (#4)

Already done in:

- `/studio/packages` — has dual layout `grid gap-3 md:hidden` (mobile
  cards) + `<Card className="hidden md:block">` (desktop table) ✓
- `/studio/clients` — `ClientsList` uses single-col on mobile via
  `sm:grid-cols-[…]` ✓

Still missing:

- `[ ]` **C1** — `/studio/clients/[id]` past-sessions table — confirm.
- `[ ]` **C2** — `/studio/sessions/[id]` set-group rows in the
  session builder — confirm.

### D. Forms — single-column on mobile (#5)

- `[x]` Package form: `grid gap-5 sm:grid-cols-3` ✓
- `[ ]` **D1** — Schedule form (`/studio/calendar/new/schedule-form.tsx`)
  date/time row — verify single-column on mobile.
- `[ ]` **D2** — Add-exercise form (`/studio/library/new`) and group
  fields — verify single-column.
- `[ ]` **D3** — Sets builder (set-group rows) — must collapse to
  single column on mobile per spec; currently desktop-style row.

### E. Calendar (#6) — STRUCTURAL

The post-deploy calendar (`calendar-grid.tsx`) has three views (week / 2
weeks / month). On mobile:

- `[ ]` **E1 — week & 2 weeks**: currently each day is a stacked card
  (default `grid` is single-col without `md:grid-cols-7`). That's
  acceptable but **not the spec**. Spec says "vertical scrollable
  list of days. Each day is a section with the day header and any
  scheduled sessions stacked vertically beneath it. Empty days
  collapse to a single thin line with a `+`."
  → Plan: switch mobile layout to a sectioned list. Empty days
  render as 32-px collapsed rows with day label on the left + `+`
  on the right. Tap expands to QuickSchedule sheet.
- `[ ]` 🚩 **E2 — month view**: currently `grid-cols-7` even on
  mobile. 7 cells × 35–42 days × 375 px ≈ 50 px each. Day numbers
  fit but session pills cannot. **This view fundamentally doesn't
  translate to a 375 px column grid.** Two reasonable redesigns:
    1. **Mobile month = list view**: same vertical sectioned list
       used by week view, just with the longer date range. Visually
       identical to "long week."
    2. **Mobile month = mini grid + selected-day detail**: a tappable
       small calendar grid up top, and below it the chosen day's
       sessions stacked.
  Both work. **Flagging for user choice before I change the
  structure.** Until then I'll keep the desktop month grid as-is and
  hide it behind `md:` (mobile users see week / 2-weeks list view
  by default).

### F. Touch targets (#7)

Globally enforce `min-h-11 min-w-11` on tappable controls. Specific
violators:

- `[ ]` **F1** — Calendar view-switcher pills (`px-3 py-1.5`) —
  ~30 px tall. Bump to `py-2.5` (40 px) + min-h-11 wrapper or
  inline-flex h-11.
- `[ ]` **F2** — Calendar prev/next buttons (`h-9 w-9` = 36 px). → `h-11 w-11`.
- `[ ]` **F3** — Dashboard QuickActions pills (`h-9` = 36 px). → `h-11`.
- `[ ]` **F4** — Action-feed inline action button "mark paid" (`h-8`).
  Acceptable density on desktop, but bump on mobile to 44.
- `[ ]` **F5** — `SessionRow` ⋯ menu button (`h-6 w-6`) — way under.
  Wrap in 44 px tap region.
- `[ ]` **F6** — `SubscriberList` chevron + popover items — the chip
  is 28 px tall. Mobile: full-screen overlay (per #9) with 44 px rows.

### G. Filter / chip rows — horizontal scroll (#8)

- `[ ]` **G1** — `/studio/library` filter chips currently flex-wrap
  to multiple rows. Convert to overflow-x-auto, momentum scroll,
  edge fade.
- `[ ]` **G2** — `/studio/clients` toolbar (search + sort + needs-
  attention) wraps on narrow widths. Consider chip-row pattern OR
  stack them vertically.

### H. Modals + popovers (#9)

- `[x]` Most dialogs already use bottom-sheet on mobile
  (`rounded-t-3xl pb-7 md:rounded-3xl`) — RequestSessionDialog,
  ExtraInAppDialog, CycleDialog, QuickSchedule ✓
- `[ ]` **H1** — `SubscriberList` popover (now portalled) — at <640
  becomes a full-screen overlay with close button instead of
  positioned dropdown. Add a small `useMediaQuery` or `sm:hidden`
  branch.
- `[ ]` **H2** — Custom kebab menus (`SessionRow`, calendar-section,
  etc.) currently use absolute positioning — works post the fixed
  scrim but on mobile a bottom sheet would be more thumb-reachable.

### I. Safe-area + bottom space (#11)

- `[ ]` **I1** — No page applies `padding-bottom: env(safe-area-inset-bottom)`.
  Add to `<main>` wrapper in studio-shell + the client portal root.
  Pattern: `pb-[calc(env(safe-area-inset-bottom)+5rem)]` on mobile.

### J. Horizontal page scroll (#12)

- `[ ]` **J1** — Spot-check at 320 px: a few long single-line strings
  (subdomain URLs, exercise IDs in the library) might overflow.
  Add `break-all` / `truncate` where appropriate.
- `[ ]` **J2** — `Card` with `px-7 py-7` (28 px each) — fine at 320,
  but `<Table>` wrapper `overflow-x-auto` ensures wide tables don't
  push the page width.

### K. Typography (#10)

- `[x]` h1 already capped at `text-3xl` (30 px) on mobile. Display
  font for hero pages stays `text-3xl` — within range.
- `[ ]` **K1** — Body text mostly `text-sm` (14 px). User wants 15 px
  on mobile. Consider bumping `text-sm` overrides to `text-[15px]`
  in primary content paragraphs (but eyebrows/labels stay at 11 px).

### L. Bottom CTA reachability (#11)

- `[ ]` **L1** — Save / submit buttons at the end of long forms (e.g.
  package form, exercise form) end up in a position where the iOS
  home bar might cover them. Plan: sticky bottom action bar on
  mobile for primary CTAs.

---

## Structural concerns (user sign-off recommended)

1. **Calendar month view on mobile (E2)** — see plan above. Flagging
   for choice between "list view" or "mini-grid + day detail."
2. **Client-portal shell (A2)** — currently no shell wraps
   `/client/*`. Should we add a slim header (wordmark + sign-out)
   for parity with `/studio`?
3. **Sticky bottom action bar (L1)** — proposed for forms with a
   primary save action below the fold; pattern used by major mobile
   apps. Want to adopt globally or per-form?

---

## Plan (commit per category)

1. **chore: shared mobile primitives** — add `BottomSheet` wrapper +
   `ChipRow` (horizontal scroll w/ edge fade).
2. **feat(mobile): touch targets ≥ 44 px globally** — Button + Input +
   custom controls.
3. **feat(mobile): calendar list view on mobile** — week + 2-weeks
   render as vertical day sections; empty days collapse to thin row.
4. **fix(mobile): form column collapse** — audit + fix every grid
   form to single-col below sm.
5. **fix(mobile): library chip row + nav clusters horizontal** —
   replace flex-wrap with horizontal scroll.
6. **fix(mobile): safe-area + bottom CTA reachability** — env()
   padding + sticky bottom action where forms exceed viewport.
7. **chore: tighten above-the-fold spacing** — drop pre-content
   padding so first content row appears under the page title.
8. **fix(mobile): SessionRow + SubscriberList full-screen overlays
   below 640 px**.

After each commit: typecheck + build, deploy, re-audit at 320 / 375 /
390 / 414. Final summary appended to this file.
