import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { enterBeta } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand/wordmark";
import { BETA_COOKIE, isValidBetaCode, parseBetaCodes } from "@/lib/beta";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function BetaGatePage({ searchParams }: Props) {
  const sp = await searchParams;
  const codes = parseBetaCodes(process.env.BETA_CODES);

  // Validate the cookie against the *current* code list before
  // bouncing — a stale cookie (code rotated, env emptied) shouldn't
  // count, otherwise we'd ping-pong between /beta and the middleware.
  const jar = await cookies();
  const cookieValue = jar.get(BETA_COOKIE)?.value;
  if (cookieValue && codes.length > 0 && isValidBetaCode(cookieValue, codes)) {
    redirect(sp.next || "/");
  }

  // Misconfiguration safety net: if no codes are loaded, surface that
  // explicitly rather than rejecting every input as "not valid".
  if (codes.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6 py-16 rise-in">
        <Wordmark variant="inline-platform" />
        <h1 className="mt-12 text-3xl md:text-4xl leading-tight">Beta&rsquo;s offline.</h1>
        <p className="mt-3 text-[color:var(--color-ink)]/75">
          We&rsquo;re between batches of testers. Check back soon, or message Joelle directly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6 py-16 rise-in">
      <Wordmark variant="inline-platform" />
      <h1 className="mt-12 text-3xl md:text-4xl leading-tight">Private beta.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Enter your access code to continue. If you don&rsquo;t have one, Joelle can send you one.
      </p>
      <form action={enterBeta} className="mt-10 flex w-full flex-col gap-4">
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">access code</Label>
          <Input id="code" name="code" autoFocus autoComplete="off" spellCheck={false} required />
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
