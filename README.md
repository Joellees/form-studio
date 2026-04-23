# Form Studio

The studio software for trainers who think like craftspeople.

Multi-tenant SaaS for 1:1 personal trainers. Each trainer runs their own branded studio at
`{slug}.formstudio.com` — public marketing page, private dashboard, and their clients&rsquo;
private space, all from one Next.js 15 app backed by Supabase.

## Stack
Next.js 15 (App Router, TypeScript, Server Actions) · Clerk · Supabase (Postgres + Storage
+ Realtime + RLS) · Tailwind v4 · Vercel · Resend · Stripe Connect (Phase 2)

## Quickstart

```bash
# Prereqs: Node 20+, Supabase CLI, a Clerk account, a Supabase project
cp .env.example .env.local           # fill in the keys (see §Setup)
npm install
npx supabase link --project-ref <ref>
npm run db:push                      # apply the initial migration
npm run db:types                     # regenerate TS types
npm run dev                          # http://localhost:3000
```

Visit the marketing site at `http://localhost:3000`.
Test subdomain routing at `http://joelle.localhost:3000` (most modern browsers resolve
`*.localhost` automatically).

## Setup

### 1 · Clerk
1. Create a Clerk application at <https://dashboard.clerk.com>.
2. Copy the publishable and secret keys into `.env.local`.
3. Under **JWT Templates**, create a new template named `supabase`:
   - **Signing algorithm:** `HS256`
   - **Signing key:** paste the **JWT secret** from your Supabase project (`Settings → API → JWT Settings`).
   - **Claims:** include `{"sub": "{{user.id}}", "email": "{{user.primary_email_address}}"}`
   - Set the TTL to 60s; tokens are refreshed per request server-side.
4. In **Paths**, set sign-in URL = `/sign-in`, sign-up URL = `/sign-up`,
   after-sign-up URL = `/onboarding`.

### 2 · Supabase
1. Create a project at <https://supabase.com/dashboard>.
2. Copy URL, anon key, service role key, and JWT secret into `.env.local`.
3. Apply migrations: `npm run db:push`.
4. In **Storage**, confirm the four buckets created by `config.toml` exist
   (`exercise-videos`, `exercise-thumbs`, `trainer-assets`, `client-progress`).

### 3 · Fonts (local build)
General Sans is bundled as a variable `.woff2` at `public/fonts/GeneralSans-Variable.woff2`.
Download it from <https://www.fontshare.com/fonts/general-sans> and place it there before
building — layout.tsx references this file via `next/font/local`.

Fraunces is loaded from Google Fonts at build time (no file required).

### 4 · Resend (optional in local dev)
Required for transactional emails. Leave blank to run without sending.

### 5 · Vercel (production)
1. Create a Vercel project and link this repo.
2. Add all `.env.local` values as Vercel environment variables.
3. **Domains:**
   - Add `formstudio.com` and `www.formstudio.com` as primary.
   - Add `*.formstudio.com` as a wildcard.
   - Add `admin.formstudio.com`.
4. Vercel will issue certificates automatically for each.

## Architecture

- **Multi-tenancy:** One app, one DB, one deploy. `src/middleware.ts` parses the subdomain
  and sets request headers `x-tenant-slug` + `x-tenant-kind`. Trainer subdomains are
  rewritten to `/s/{slug}` internally — clients at the same subdomain hit `/studio/*`.
- **Auth:** Clerk owns identity. A signed JWT (template `supabase`) is attached to every
  Supabase request server-side. Postgres RLS uses the `sub` claim to scope rows.
- **Data:** All tables except `super_admins` carry `tenant_id`. RLS policies restrict
  trainers to their own tenant, clients to their own rows, and the service role bypasses
  RLS only in webhooks, onboarding, and super admin code paths.
- **Storage:** Private buckets (`exercise-videos`, `client-progress`) use folder-prefix
  RLS matching the user&rsquo;s tenant or client ID.
- **Pages:**
  - `formstudio.com` → `/page.tsx` marketing site
  - `{slug}.formstudio.com` → `/s/[slug]/page.tsx` (public) + `/studio/*` (trainer dashboard, same host)
  - `admin.formstudio.com` → `/admin/*`

## Scripts
See `package.json`. `CLAUDE.md` documents house conventions.

## Roadmap
Phase 1 is tracked in `TASKS.md`. Phase 2 (Stripe Connect, Tap Payments, WhatsApp via
Twilio, custom domains, testimonials, analytics) lives in the brief.
