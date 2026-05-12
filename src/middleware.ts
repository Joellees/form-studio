import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { BETA_COOKIE } from "@/lib/beta";
import { isPreviewToken, PREVIEW_HEADER, PREVIEW_QUERY } from "@/lib/preview";
import { createSupabaseEdgeClient } from "@/lib/supabase/edge";
import { parseHost, TENANT_KIND_HEADER, TENANT_SLUG_HEADER } from "@/lib/tenancy";

const isPublicRoute = createRouteMatcher([
  "/",
  "/beta(.*)",
  "/invite/(.*)",
  "/me",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/s/(.*)", // public trainer pages are rewritten under /s/{slug}
  "/api/webhooks/(.*)",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/icons/(.*)",
  "/robots.txt",
  "/sitemap.xml",
]);

/**
 * Paths exempt from the beta gate.
 *
 * The beta gate keeps random people from signing up as trainers. It
 * does NOT need to protect:
 *   - `/beta` itself (otherwise the gate can&rsquo;t render)
 *   - `/invite/*` — an invite link IS the beta pass; the claim action
 *     sets a valid beta cookie on success
 *   - `/sign-in` — returning trainers and clients can always sign back
 *     in (Clerk handles authorization)
 *   - static assets + service worker
 *
 * In addition to this list, any request with a live Clerk session bypasses
 * the gate entirely — once you&rsquo;re signed in, you&rsquo;re inside.
 */
const BETA_EXEMPT_PREFIXES = [
  "/beta",
  "/invite/",
  "/sign-in",
  "/_next",
  "/icons",
  "/fonts",
  "/manifest.webmanifest",
  "/robots.txt",
  "/favicon.ico",
  "/sw.js",
];

function isBetaExempt(pathname: string): boolean {
  return BETA_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Middleware layers, in order:
 *   1. Parse the hostname → tenant kind.
 *   2. Beta gate — fail-closed: every signed-out request to a
 *      non-exempt path must carry a valid beta cookie. If the env
 *      `BETA_CODES` list is empty (misconfig, deploy gap, anything),
 *      we still redirect to `/beta` so nobody slips through. Signed-in
 *      users bypass — they were vouched at sign-up time.
 *   3. Rewrite trainer subdomains into /s/[slug].
 *   4. Clerk auth on non-public routes.
 */
export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get("host") ?? "";
  const { slug, kind } = parseHost(host);
  const url = req.nextUrl.clone();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(TENANT_KIND_HEADER, kind);
  if (slug) requestHeaders.set(TENANT_SLUG_HEADER, slug);
  // Expose the resolved pathname to server components / layouts so
  // they can self-exempt from gates (e.g. the /studio/expired page
  // must NOT trigger the subscription redirect or it'd loop).
  requestHeaders.set("x-pathname", url.pathname);

  // Stateless preview mode for tooling that can't hold cookies (Claude
  // chat / web_fetch / link previews). A request carrying a valid
  // `fs_preview` token in either the query string or an `X-Fs-Preview`
  // header bypasses the beta gate AND Clerk auth, and is treated as
  // the seed trainer downstream. Mutating verbs are rejected at the
  // edge so no preview request can change state. See `lib/preview.ts`.
  const previewQuery = url.searchParams.get(PREVIEW_QUERY);
  const previewHeader = req.headers.get(PREVIEW_HEADER);
  const isPreview = isPreviewToken(previewQuery) || isPreviewToken(previewHeader);

  // Canonical-host redirect — production traffic that lands on the
  // Vercel preview hostname is permanently moved to the canonical
  // host (form-studio.app in prod). Preserves path + query.
  //
  // Gated behind `ENABLE_CANONICAL_REDIRECT=true` so we can deploy
  // this code BEFORE DNS for the canonical host is live — flipping
  // the flag too early would 308 every visit on the Vercel URL to
  // a domain that doesn't resolve yet.
  //
  // After DNS + SSL are verified per `DOMAIN_SETUP.md`, set
  // `ENABLE_CANONICAL_REDIRECT=true` on Vercel production. Until
  // then both hostnames serve the app directly.
  //
  // Always exempts:
  //   - fs_preview requests (preview-token tooling must stay
  //     reachable on the Vercel URL)
  //   - localhost / 127.0.0.1 (dev)
  const canonicalRedirectEnabled =
    process.env.ENABLE_CANONICAL_REDIRECT === "true";
  const canonicalHostRaw = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (canonicalRedirectEnabled && canonicalHostRaw && !isPreview) {
    try {
      const canonicalHost = new URL(canonicalHostRaw).host;
      const isLocal =
        host.startsWith("localhost") || host.startsWith("127.0.0.1");
      if (
        canonicalHost &&
        host &&
        host !== canonicalHost &&
        !isLocal &&
        host.endsWith(".vercel.app")
      ) {
        const target = req.nextUrl.clone();
        target.host = canonicalHost;
        target.protocol = "https:";
        target.port = "";
        return NextResponse.redirect(target, 308);
      }
    } catch {
      // malformed NEXT_PUBLIC_APP_URL — skip the redirect rather
      // than crash every request.
    }
  }
  if (isPreview) {
    if (!["GET", "HEAD"].includes(req.method)) {
      return new NextResponse("preview is read-only", { status: 405 });
    }
    requestHeaders.set(PREVIEW_HEADER, "1");
  }

  // Beta gate — always on for signed-out visitors hitting a non-exempt
  // path. Cookie value is validated against `public.access_codes` via
  // the `is_access_code_valid` RPC (SECURITY DEFINER, anon-callable).
  // The DB is the single source of truth — the older `BETA_CODES`
  // env-var system was removed in this commit because it drifted from
  // the redemption flow and caused a redirect loop between this gate
  // and `/beta` (which has always validated against the DB).
  //
  // Bypass: when `PUBLIC_SIGNUPS_OPEN=true` (Launch cohort live), the
  // gate is off entirely. Beta 1 / Beta 2 codes still work for those
  // who have them — only the gate goes away, not redemption.
  //
  // Fail mode: on RPC error (network, transient DB, schema cache miss)
  // we LET THE REQUEST THROUGH with a console.warn. Failing closed
  // would recreate the loop in the failure path — the `/beta` page
  // uses a different client (service-role admin) and might still
  // succeed, causing it to redirect through while we keep rejecting.
  // Letting through is safe because every access-gated route below
  // the gate has its own auth check (Clerk for /studio /client /admin,
  // tenancy resolution for /s/[slug]).
  const publicSignupsOpen = process.env.PUBLIC_SIGNUPS_OPEN === "true";
  if (!publicSignupsOpen && !isPreview && !isBetaExempt(url.pathname)) {
    const { userId } = await auth();
    if (!userId) {
      const cookieValue = req.cookies.get(BETA_COOKIE)?.value;
      let hasValidCode = false;
      if (cookieValue) {
        try {
          const sb = createSupabaseEdgeClient();
          const { data, error } = await sb.rpc("is_access_code_valid", {
            p_code: cookieValue,
          });
          if (error) {
            console.warn("middleware.beta_gate.rpc_error_fail_open", {
              code: error.code,
              message: error.message,
            });
            hasValidCode = true; // fail open — see comment block above
          } else {
            hasValidCode = data === true;
          }
        } catch (err) {
          console.warn("middleware.beta_gate.rpc_throw_fail_open", {
            message: err instanceof Error ? err.message : String(err),
          });
          hasValidCode = true; // fail open
        }
      }
      if (!hasValidCode) {
        const gate = req.nextUrl.clone();
        gate.pathname = "/beta";
        gate.search = `?next=${encodeURIComponent(url.pathname + url.search)}`;
        return NextResponse.redirect(gate);
      }
    }
  }

  // Trainer subdomain rewrite.
  if (kind === "trainer" && slug) {
    const appPrefixes = ["/studio", "/client", "/sign-in", "/sign-up", "/onboarding", "/api", "/s/", "/beta", "/invite", "/me"];
    const isAppPath = appPrefixes.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
    if (!isAppPath) {
      url.pathname = `/s/${slug}${url.pathname === "/" ? "" : url.pathname}`;
      const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      res.headers.set(TENANT_KIND_HEADER, kind);
      res.headers.set(TENANT_SLUG_HEADER, slug);
      return res;
    }
  }

  if (kind === "admin" && !url.pathname.startsWith("/admin")) {
    url.pathname = `/admin${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  if (!isPreview && !isPublicRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and the service worker.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|ttf|woff|woff2)).*)",
    "/(api|trpc)(.*)",
  ],
};
