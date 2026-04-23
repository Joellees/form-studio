import { headers } from "next/headers";

import { env } from "@/lib/env";

/**
 * Every request passes through `middleware.ts`, which resolves the subdomain
 * and stores it in the `x-tenant-slug` header. Server code should read it
 * via `getTenantSlug()` — never parse hostnames itself.
 */
export const TENANT_SLUG_HEADER = "x-tenant-slug";
export const TENANT_KIND_HEADER = "x-tenant-kind";

export type TenantKind = "root" | "admin" | "trainer";

export async function getTenantSlug(): Promise<string | null> {
  const h = await headers();
  return h.get(TENANT_SLUG_HEADER);
}

export async function getTenantKind(): Promise<TenantKind> {
  const h = await headers();
  const kind = h.get(TENANT_KIND_HEADER);
  if (kind === "root" || kind === "admin" || kind === "trainer") return kind;
  return "root";
}

/** Slugs we never hand out to trainers — they collide with platform routes. */
export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "auth",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "dashboard",
  "docs",
  "help",
  "support",
  "blog",
  "pricing",
  "about",
  "legal",
  "terms",
  "privacy",
  "status",
  "mail",
  "smtp",
  "static",
  "assets",
  "cdn",
  "vercel",
  "clerk",
  "supabase",
  "stripe",
  "formstudio",
  "form-studio",
]);

/** Parse the hostname and return the tenant slug (null = root). */
export function parseHost(host: string): { slug: string | null; kind: TenantKind } {
  const rootDomain = env.NEXT_PUBLIC_ROOT_DOMAIN;
  const cleanHost = host.toLowerCase().split(":")[0] ?? "";
  const cleanRoot = rootDomain.toLowerCase().split(":")[0] ?? "";

  if (cleanHost === cleanRoot || cleanHost === `www.${cleanRoot}`) {
    return { slug: null, kind: "root" };
  }
  if (cleanHost.endsWith(`.${cleanRoot}`)) {
    const subdomain = cleanHost.slice(0, -(cleanRoot.length + 1));
    if (subdomain === "admin") return { slug: null, kind: "admin" };
    if (RESERVED_SLUGS.has(subdomain)) return { slug: null, kind: "root" };
    return { slug: subdomain, kind: "trainer" };
  }
  // Custom domains — Phase 2. For now, treat as root.
  return { slug: null, kind: "root" };
}

/** Validate a requested slug during trainer sign-up. Letters only, lowercase. */
export function isValidSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 32) return false;
  if (!/^[a-z]+$/.test(slug)) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  return true;
}
