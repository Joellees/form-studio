# Domain setup — form-studio.app

How Form Studio gets onto its production domain. Everything in code
is already wired to the new domain via `lib/urls.ts` + the env vars.
The remaining work is manual configuration in Vercel, Cloudflare,
and Clerk.

## URL plan

| surface | URL |
|---|---|
| marketing / landing | `form-studio.app` |
| public trainer profile | `form-studio.app/s/[handle]` |
| trainer studio | `form-studio.app/studio/*` |
| admin tool | `form-studio.app/admin` |
| invite landing | `form-studio.app/invite/[token]` |
| access-code gate | `form-studio.app/beta` |
| Vercel preview (kept) | `form-studio-beta.vercel.app` |

The Vercel preview hostname stays reachable for:

- dev iteration (deploy previews)
- the `fs_preview=<TOKEN>` stateless tooling flow

For *any other* production traffic that hits `form-studio-beta.vercel.app`,
the middleware issues a **308 permanent redirect** to the same path
on `form-studio.app` (host swap only — path + query preserved).
Requests carrying `?fs_preview=…` are exempt from the redirect and
keep working on the Vercel hostname.

---

## 1 · Vercel domain configuration

In **Vercel → Project → Settings → Domains**:

1. Click **Add Domain** → enter `form-studio.app` → **Add**. Vercel
   suggests apex configuration (A record) — note the IP (currently
   `76.76.21.21`).
2. Click **Add Domain** → enter `www.form-studio.app` → **Add**.
   Vercel will offer to set up a redirect from `www` → apex; accept.
3. Wait until both rows show **Valid Configuration** (5–60 min after
   DNS propagates). Vercel auto-issues Let's Encrypt SSL certs once
   the DNS resolves — green padlock = done.

Keep the existing `form-studio-beta.vercel.app` alias on the project
— the middleware redirect needs the hostname to keep resolving.

---

## 2 · Cloudflare DNS

In **Cloudflare → form-studio.app → DNS → Records**:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| A | `@` | `76.76.21.21` | **DNS only** (gray cloud) | Auto |
| CNAME | `www` | `cname.vercel-dns.com` | **DNS only** (gray cloud) | Auto |

**Critical:** proxy status must be **DNS only** (gray cloud) on both
records — orange-cloud (Cloudflare-proxied) breaks Vercel's SSL
issuance and HTTP/3.

Propagation typically takes 5–10 min, sometimes up to an hour.
Check status from a clean DNS resolver:

```bash
dig form-studio.app +short
dig www.form-studio.app +short
```

Both should return Vercel's IP / CNAME within a minute of the
records hitting the wire.

---

## 3 · Clerk configuration

In **Clerk Dashboard → Configure → Settings**:

1. **Domains** (left nav):
   - **Add domain** → `form-studio.app` → set as Production primary.
   - Keep `form-studio-beta.vercel.app` listed as a development /
     staging domain so the preview-token flow keeps working.
2. **Paths** (left nav):
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After-sign-out URL: `https://form-studio.app/`
   - After-sign-in URL: `https://form-studio.app/me`
   - After-sign-up URL: `https://form-studio.app/me`
3. **Sessions → Customize session token** — no change required;
   the `supabase` JWT template stays as-is.

The `https://form-studio.app/me` redirect target is the one that
routes signed-in users to their right surface
(`/studio/dashboard`, `/client/dashboard`, or `/onboarding`)
based on their existing DB state — see `src/app/me/page.tsx`.

---

## 4 · Resend domain verification

In **Resend → Domains** verify `form-studio.app` so the
`hello@form-studio.app` FROM address is usable:

1. **Add domain** → `form-studio.app`
2. Resend gives you 3 DNS records (SPF / DKIM / DMARC) — add them
   in Cloudflare (same DNS-only setting as the A record).
3. Click **Verify** in Resend; it polls and flips green once the
   records propagate.

Until verification completes, transactional emails won't send. The
`sendEmail` helper silently no-ops + console-logs when
`RESEND_API_KEY` is unset, so dev / staging stays unaffected.

---

## 5 · Environment variables

Already set on Vercel production:

| var | value | set by |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://form-studio.app` | this commit |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `form-studio.app` | this commit |

**Set this only after DNS + SSL are live on `form-studio.app`** —
flipping it early redirects every visit on the Vercel URL to a
domain that doesn't resolve yet:

| var | value |
|---|---|
| `ENABLE_CANONICAL_REDIRECT` | `true` |

```bash
npx vercel env add ENABLE_CANONICAL_REDIRECT production --value 'true' --yes
npx vercel --prod --yes
```

Until you flip the flag, both hostnames serve the app directly.
Every link the app generates (invite URLs, WhatsApp prefill, etc.)
already points to `form-studio.app` via the helpers in
`lib/urls.ts` — so once DNS resolves, those links start working;
once the flag flips, old links to the Vercel URL also redirect.

When you complete Resend verification, also set:

| var | value |
|---|---|
| `RESEND_FROM_EMAIL` | `Form Studio <hello@form-studio.app>` |

```bash
npx vercel env add RESEND_FROM_EMAIL production --value 'Form Studio <hello@form-studio.app>' --yes
```

---

## 6 · Verifying SSL

Once Vercel reports **Valid Configuration**:

```bash
curl -I https://form-studio.app
# Expect: HTTP/2 200 — or a 307/308 redirect if hitting a route
# that auth-bounces (e.g. /studio without a session).

openssl s_client -showcerts -connect form-studio.app:443 -servername form-studio.app < /dev/null 2>&1 | grep -i "issuer\|subject"
# Expect: Issuer: C=US, O=Let's Encrypt, ...
```

Browser test: open `https://form-studio.app` in an incognito
window. Green padlock + no certificate warnings = done.

---

## 7 · Verifying the redirect

After DNS propagates and the cert is live:

```bash
curl -sI https://form-studio-beta.vercel.app/ | grep -iE "location|HTTP"
# Expect: HTTP/2 308 + location: https://form-studio.app/

curl -sI "https://form-studio-beta.vercel.app/?fs_preview=<TOKEN>" | grep -iE "location|HTTP"
# Expect: HTTP/2 200 (preview flow exempt — preview token kept the
# request on the Vercel hostname).
```

---

## 8 · Rollback

If something breaks after switching:

1. Flip the env vars back:
   ```bash
   npx vercel env rm NEXT_PUBLIC_APP_URL production --yes
   npx vercel env add NEXT_PUBLIC_APP_URL production --value 'https://form-studio-beta.vercel.app' --yes
   ```
2. Redeploy: `npx vercel --prod --yes`.
3. The middleware redirect is conditional on `NEXT_PUBLIC_APP_URL`;
   resetting it stops the redirect. Code-side everything still
   works because the helpers in `lib/urls.ts` read the env var.

No DNS / Clerk / Resend rollback is required at the rollback step
— those configurations stay valid for `form-studio.app` even when
the app is serving from the Vercel hostname; they just sit unused.

---

## 9 · Acceptance walk (after DNS + Clerk + SSL are live)

1. `https://form-studio.app/` → landing page renders.
2. `https://form-studio.app/s/joelle` → Joelle's public profile renders.
3. `https://form-studio.app/admin` → admin tool (signed-in admin user).
4. `https://form-studio.app/studio/dashboard` → trainer dashboard
   for a signed-in trainer (subscription gated).
5. `https://form-studio.app/invite/<CODE>` → invite landing.
6. `https://form-studio.app/beta` → access-code gate.
7. `https://form-studio-beta.vercel.app/` → 308 → `https://form-studio.app/`.
8. `https://form-studio-beta.vercel.app/?fs_preview=<TOKEN>` → 200
   (preview-token flow stays on Vercel).
9. Browser DevTools → Network tab on `form-studio.app` shows
   `<link rel="canonical" href="https://form-studio.app/">` in the
   document head.
10. `grep -rn "formstudio\.com\|form-studio-beta\.vercel\.app" src/`
    returns zero results in active code paths (matches in
    `DOMAIN_SETUP.md` + `lib/urls.ts` fallback OK).
