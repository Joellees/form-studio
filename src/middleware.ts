import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { parseHost, TENANT_KIND_HEADER, TENANT_SLUG_HEADER } from "@/lib/tenancy";

const isPublicRoute = createRouteMatcher([
  "/",
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
 * Three-layer middleware:
 *   1. Parse the hostname → determine tenant (root / admin / trainer).
 *   2. Rewrite trainer subdomains into the /s/[slug] path so Next.js can
 *      serve them from a single route tree without per-tenant deploys.
 *   3. Hand off to Clerk for auth enforcement on non-public routes.
 *
 * Headers `x-tenant-slug` and `x-tenant-kind` are propagated so Server
 * Components can read them via `getTenantSlug()` without re-parsing.
 */
export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get("host") ?? "";
  const { slug, kind } = parseHost(host);
  const url = req.nextUrl.clone();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(TENANT_KIND_HEADER, kind);
  if (slug) requestHeaders.set(TENANT_SLUG_HEADER, slug);

  // Trainer subdomain → rewrite to /s/{slug}/...
  if (kind === "trainer" && slug) {
    // Preserve dashboard & studio app under the subdomain; only the bare root
    // and /studio/* are rewritten into the public marketing surface.
    if (!url.pathname.startsWith("/s/")) {
      url.pathname = `/s/${slug}${url.pathname === "/" ? "" : url.pathname}`;
      const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      res.headers.set(TENANT_KIND_HEADER, kind);
      res.headers.set(TENANT_SLUG_HEADER, slug);
      return res;
    }
  }

  // Admin subdomain → rewrite to /admin/...
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
    // Skip Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|ttf|woff|woff2)).*)",
    "/(api|trpc)(.*)",
  ],
};
