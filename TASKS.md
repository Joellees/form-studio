# Form Studio — Task List

Live task tracker. Update after every completed step.

## M0 — Scaffold ✅
- [x] `package.json` with pinned Next 15, React 19, Tailwind 4, Clerk, Supabase
- [x] `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`
- [x] `.env.example` with every env var documented
- [x] Base `src/app/layout.tsx`, `globals.css`, root `page.tsx`
- [x] `src/middleware.ts` — subdomain parsing + Clerk auth
- [x] Supabase server + browser clients, service-role helper
- [x] `supabase/config.toml` with storage buckets
- [x] `supabase/migrations/0001_init.sql` with all core tables + RLS
- [x] `CLAUDE.md`, `TASKS.md`, `README.md`
- [x] `vercel.json` for wildcard domain
- [x] PWA manifest + SVG icons
- [x] Install dependencies, typecheck clean
- [x] Initial Git commit

## M1 — Brand system ✅
- [x] Fraunces + General Sans font wiring
- [x] CSS custom properties for palette and typography
- [x] `Wordmark` component (stacked + inline + inline-platform)
- [x] Core primitives: Button, Card, Input, Textarea, Label, Table, Badge, EmptyState

## M2 — Auth & tenancy ✅
- [x] Clerk provider in root layout
- [x] `/sign-in`, `/sign-up` pages
- [x] Subdomain middleware with reserved-slug guard and app-path allowlist
- [x] `/onboarding` flow with slug claim
- [x] Supabase server client attaches Clerk JWT
- [x] RLS policies cover every table

## M3 — Public trainer page ✅
- [x] `/s/[slug]` page with hero, approach, packages blocks
- [x] `trainer_public` view exposes safe marketing fields
- [x] `not-found.tsx` for nonexistent trainers

## M4 — Clients, packages, subscriptions ✅
- [x] Trainer: add client
- [x] Trainer: package CRUD with archive
- [x] Public: `/subscribe/[pkgId]` — pending subscription on confirm
- [x] Trainer: mark subscription paid (activates, sends email)
- [x] Client profile page with per-field toggles

## M5 — Exercise library ✅
- [x] List + filter + search
- [x] Create/edit with video upload to `exercise-videos` bucket
- [x] Video upload route handler with Clerk auth + size/type validation
- [x] Archive

## M6 — Session templates ✅
- [x] Template list + CRUD
- [x] Exercise picker → block/exercise/set-group builder
- [x] Inline rep/weight editors (fixed, range, time, per-side, amrap, single)
- [x] Archive

## M7 — Calendar & scheduling ✅
- [x] Trainer 7-day grid in trainer tz
- [x] Client upcoming + past list
- [x] Schedule with optional template clone
- [x] Client request → trainer approve/decline
- [x] Cancellation cutoff enforced server-side (midnight trainer-tz day before)
- [x] Credit restoration rules per cancellation policy

## M8 — Session logging ✅
- [x] Trainer logs performed for in-person/zoom
- [x] Client logs performed for in-app (same component, role-gated via RLS)
- [x] Session detail pages for both sides

## M9 — Client logs ✅
- [x] Weight, measurements, cycle phase, mood, sleep, PRs (JSONB)
- [x] Only-enabled-fields rendering on the form
- [x] Recent entries table

## M10 — Notifications & polish ✅
- [x] Resend client with dev-safe no-op when key missing
- [x] Email on subscription activation
- [x] Service worker + manifest for PWA installability
- [x] Focus rings, semantic HTML, reduced-motion support

## Deferred (explicit follow-ups)
- [ ] Supabase-generated TS types replace the placeholder in `database.types.ts`
- [ ] Clerk webhook to soft-delete trainers on account deletion
- [ ] Rounds / supersets in template builder UI (schema already supports)
- [ ] Thumbnail auto-generation from uploaded video first frame
- [ ] Progress photos storage + viewer (schema ready, UI deferred)
- [ ] Clerk invitation email → auto-link to `clients.email`
- [ ] Playwright smoke tests: sign-up, subscribe, schedule, cancel
- [ ] Phase 2: Stripe Connect, Tap Payments, testimonials, custom domains,
      WhatsApp reminders, platform subscriptions, super admin console beyond list
