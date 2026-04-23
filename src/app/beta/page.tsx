import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { enterBeta } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand/wordmark";
import { BETA_COOKIE } from "@/lib/beta";

type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function BetaGatePage({ searchParams }: Props) {
  const sp = await searchParams;
  // If already authorized, bounce to home.
  const jar = await cookies();
  if (jar.get(BETA_COOKIE)?.value) redirect(sp.next || "/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center px-6 py-16 rise-in">
      <Wordmark variant="inline-platform" />
      <h1 className="mt-12 font-display text-4xl leading-tight">Private beta.</h1>
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
