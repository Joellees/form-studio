import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { BETA_COOKIE, isValidBetaCode, parseBetaCodes } from "@/lib/beta";
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
 *   2. Beta gate — redirects to /beta if no valid code cookie (only when
 *      BETA_CODES is configured; otherwise open).
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

  // Beta gate — only enforced when BETA_CODES is set, only on exempt
  // paths, and only for users without a live Clerk session. Signed-in
  // users don&rsquo;t need a beta code; they&rsquo;ve already been vouched for.
  const betaCodes = parseBetaCodes(process.env.BETA_CODES);
  if (betaCodes.length > 0 && !isBetaExempt(url.pathname)) {
    const { userId } = await auth();
    if (!userId) {
      const cookieValue = req.cookies.get(BETA_COOKIE)?.value;
      const hasValidCode = cookieValue ? !!isValidBetaCode(cookieValue, betaCodes) : false;
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

  if (!isPublicRoute(req)) {
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
