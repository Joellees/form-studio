import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { BETA_COOKIE, isValidBetaCode, parseBetaCodes } from "@/lib/beta";
import { isPreviewToken, PREVIEW_HEADER, PREVIEW_QUERY } from "@/lib/preview";
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
  // path. Closed-by-default: empty / missing BETA_CODES means nobody
  // gets in (the /beta page shows a helpful "no codes configured"
  // message in that case). Until we ship a paywall, the code IS the
  // entitlement.
  //
  // Bypass: when `PUBLIC_SIGNUPS_OPEN=true` (Launch cohort live), the
  // gate is off entirely and anyone can reach signup. Beta 1 / Beta 2
  // codes still work for those who have them — only the *gate* goes
  // away, not the redemption flow.
  const publicSignupsOpen = process.env.PUBLIC_SIGNUPS_OPEN === "true";
  if (!publicSignupsOpen && !isPreview && !isBetaExempt(url.pathname)) {
    const { userId } = await auth();
    if (!userId) {
      const betaCodes = parseBetaCodes(process.env.BETA_CODES);
      const cookieValue = req.cookies.get(BETA_COOKIE)?.value;
      const hasValidCode =
        cookieValue && betaCodes.length > 0 ? !!isValidBetaCode(cookieValue, betaCodes) : false;
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
