import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_SUPABASE_JWT_TEMPLATE: z.string().default("supabase"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  SUPER_ADMIN_CLERK_IDS: z.string().optional(),
});

/**
 * Validated public + server env. Access via `env.*` only — never process.env.
 * We parse lazily to avoid crashing builds where some secrets are intentionally absent.
 */
function parseEnv() {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_SUPABASE_JWT_TEMPLATE: process.env.CLERK_SUPABASE_JWT_TEMPLATE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    SUPER_ADMIN_CLERK_IDS: process.env.SUPER_ADMIN_CLERK_IDS,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid environment:\n  ${issues}`);
  }
  return parsed.data;
}

export const env = parseEnv();

export const superAdminClerkIds = new Set(
  (env.SUPER_ADMIN_CLERK_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export function isSuperAdmin(clerkId: string | null | undefined): boolean {
  if (!clerkId) return false;
  return superAdminClerkIds.has(clerkId);
}
