# Form Studio — Task List

Live task tracker. Update after every completed step.

## M0 — Scaffold
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
- [x] PWA manifest + icons
- [ ] Install dependencies (`npm install`) and verify build
- [ ] Initial Git commit

## M1 — Brand system
- [x] Fraunces + General Sans font wiring
- [x] CSS custom properties for palette and typography
- [x] `Wordmark` component (stacked + inline + inline-platform)
- [x] Core primitives: Button, Card, Input, Textarea, Label, Table, Badge, EmptyState
- [ ] Optional: Dialog, Dropdown, Tabs, Toast (add as needed)

## M2 — Auth & tenancy
- [x] Clerk provider in root layout
- [x] `/sign-in`, `/sign-up` pages
- [x] Subdomain middleware with reserved-slug guard
- [x] `/onboarding` flow with slug claim
- [x] Supabase server client attaches Clerk JWT
- [x] RLS policies cover every table
- [ ] Clerk webhook to soft-delete trainers on account deletion (Phase 2 polish)

## M3 — Public trainer page
- [x] `/s/[slug]` page with hero, approach, packages blocks
- [x] `trainer_public` view exposes safe marketing fields
- [x] `not-found.tsx` for nonexistent trainers
- [ ] Cover-image upload UI (M4)

## M4 — Clients, packages, subscriptions
- [ ] Trainer: invite client by email (Clerk invitation → clients row)
- [ ] Trainer: package CRUD
- [ ] Public: `/subscribe/[pkgId]` → Clerk sign-up → pending subscription
- [ ] Trainer: mark subscription as paid (activates + sets sessions_remaining)
- [ ] Client profile page with per-field toggles

## M5 — Exercise library
- [ ] List + filter + search
- [ ] Create/edit with video upload to `exercise-videos` bucket
- [ ] Server action to generate thumbnail from first frame

## M6 — Session templates
- [ ] Template list + CRUD
- [ ] Block / exercise / set-group builder
- [ ] Duplicate / archive

## M7 — Calendar & scheduling
- [ ] Trainer weekly + monthly calendar
- [ ] Client calendar
- [ ] Schedule with optional template clone
- [ ] Client request flow
- [ ] Server-enforced cancellation cutoff

## M8 — Session logging
- [ ] In-person + Zoom: trainer logs performed sets
- [ ] In-app: client logs performance; realtime update for trainer
- [ ] History view for both sides

## M9 — Client logs
- [ ] Weight, measurements, notes (MVP)
- [ ] Cycle overlay
- [ ] Progress photos (signed URLs)

## M10 — Notifications & polish
- [ ] Resend templates + send helpers
- [ ] Lighthouse PWA ≥ 90
- [ ] A11y audit
- [ ] Playwright smoke tests for sign-up, subscribe, schedule, cancel
