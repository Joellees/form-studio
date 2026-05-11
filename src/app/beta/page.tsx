import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { enterBeta } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand/wordmark";
import { BETA_COOKIE } from "@/lib/beta";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; next?: string }> };

/**
 * Beta-2 access gate. The form posts to `enterBeta` which validates
 * the code against `public.access_codes` (DB-backed, replaces the
 * legacy `BETA_CODES` env-var system).
 *
 * If the visitor already has a valid `fs_beta` cookie that resolves
 * to a live (non-revoked) code, they get redirected through.
 */
export default async function BetaGatePage({ searchParams }: Props) {
  const sp = await searchParams;

  const jar = await cookies();
  const cookieValue = jar.get(BETA_COOKIE)?.value;

  if (cookieValue) {
    const supabase = createSupabaseAdminClient();
    const { data: row } = await supabase
      .from("access_codes")
      .select("code, revoked")
      .ilike("code", cookieValue)
      .maybeSingle();
    if (row && !row.revoked) {
      redirect(sp.next || "/");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6 py-16 rise-in">
      <Wordmark variant="inline-platform" />
      <h1 className="mt-12 text-3xl md:text-4xl leading-tight">Private beta.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Enter your access code to continue. If you don&rsquo;t have one, message Joelle directly.
      </p>
      <form action={enterBeta} className="mt-10 flex w-full flex-col gap-4">
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">access code</Label>
          <Input
            id="code"
            name="code"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="text"
            required
          />
          {sp.error ? (
            <p className="text-xs text-[color:var(--color-sienna)]">
              That code isn&rsquo;t valid. Double-check with the person who invited you.
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg">
          enter
        </Button>
      </form>
    </main>
  );
}
