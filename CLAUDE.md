# Form Studio — Engineering Notes

## Stack
Next.js 15 (App Router, TypeScript) · Clerk · Supabase · Tailwind v4 · shadcn-style primitives · Vercel

## Commands
- `npm run dev` — local dev at http://localhost:3000
- `npm run build` — production build
- `npm run typecheck` — TypeScript strict check
- `npm run test` — unit tests (Vitest)
- `npm run test:e2e` — Playwright e2e
- `npm run db:push` — apply Supabase migrations
- `npm run db:types` — regenerate `src/lib/supabase/database.types.ts`

## Conventions
- Server Components by default. Client Components only where interactivity demands it.
- Server Actions for mutations, Zod-validated at the server boundary.
- RLS enforced in Supabase; no service-role client in user-facing code paths.
- TypeScript strict + `noUncheckedIndexedAccess`. No `any` without justification.
- Tabular numbers in data tables (`tabular-nums` or `[data-tnum]`).
- All dates stored UTC, rendered in the relevant user&rsquo;s timezone via `date-fns-tz`.
- Every route has a `loading.tsx`. Every list has a real empty state.
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`. Small, focused, green.

## Brand
- Palette: `--color-canvas` #F6F2EB, `--color-parchment` #E9E4D4, `--color-ink` #1F1E1B,
  `--color-moss` #4A5540, `--color-moss-deep` #2D3528, `--color-stone` #A8A095,
  `--color-sienna` #A8461F (signal — sparingly).
- Fonts: Fraunces (display, variable) + General Sans (body, variable).
- Voice: confident, lowercase-comfortable, editorial. No exclamation marks. No emoji.

## Multi-tenancy
- Subdomain = tenant. `src/middleware.ts` parses the host and sets `x-tenant-slug` + `x-tenant-kind`.
- Trainer subdomains are rewritten to `/s/{slug}` internally (no per-tenant deploys).
- Server code reads tenant via `getTenantSlug()` / `getTenantKind()` from `src/lib/tenancy.ts`.
- Every query is scoped by `tenant_id` via RLS — see `supabase/migrations/0001_init.sql`.
- Super admin at `admin.formstudio.com`. Bootstrapped via `SUPER_ADMIN_CLERK_IDS`.

## Auth
- Clerk is the identity provider. Set up a Clerk JWT template named `supabase` that signs
  with the Supabase project&rsquo;s JWT secret and includes the `sub` claim. See README §Setup.
- `src/lib/supabase/server.ts` attaches the Clerk JWT automatically.
- `createSupabaseAdminClient()` bypasses RLS — only for webhooks, onboarding, super admin.

## Task list location
See `TASKS.md` — update after every completed step.
