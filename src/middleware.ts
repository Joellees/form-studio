import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { BETA_COOKIE, isValidBetaCode, parseBetaCodes } from "@/lib/beta";
import { parseHost, TENANT_KIND_HEADER, TENANT_SLUG_HEADER } from "@/lib/tenancy";

const isPublicRoute = createRouteMatcher([
  "/",
  "/beta(.*)",
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

/** Paths that are exempt from the beta gate (otherwise the gate can&rsquo;t render). */
const BETA_EXEMPT_PREFIXES = ["/beta", "/_next", "/icons", "/fonts", "/manifest.webmanifest", "/robots.txt", "/favicon.ico", "/sw.js"];

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

  // Beta gate — only enforced when BETA_CODES is set. Keeps prod/dev
  // flows open unless we&rsquo;re explicitly in private-beta mode.
  const betaCodes = parseBetaCodes(process.env.BETA_CODES);
  if (betaCodes.length > 0 && !isBetaExempt(url.pathname)) {
    const cookieValue = req.cookies.get(BETA_COOKIE)?.value;
    const hasValidCode = cookieValue ? !!isValidBetaCode(cookieValue, betaCodes) : false;
    if (!hasValidCode) {
      const gate = req.nextUrl.clone();
      gate.pathname = "/beta";
      gate.search = `?next=${encodeURIComponent(url.pathname + url.search)}`;
      return NextResponse.redirect(gate);
    }
  }

  // Trainer subdomain rewrite.
  if (kind === "trainer" && slug) {
    const appPrefixes = ["/studio", "/client", "/sign-in", "/sign-up", "/onboarding", "/api", "/s/", "/beta"];
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
