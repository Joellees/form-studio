"use client";

import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Custom returning-trainer sign-in flow.
 *
 * Replaces Clerk's prebuilt `<SignIn/>` widget for one specific
 * reason: on clerk-js 5.x (which we're pinned to via
 * `clerkJSVersion="5.125.10"` in `app/layout.tsx` — see the long
 * comment there for why we can't bump to 6.x without also bumping
 * `@clerk/nextjs` to v7), the prebuilt's state machine fails to
 * transition out of `needs_first_factor` when the user has more
 * than one supported first-factor strategy (password + email_code
 * + reset_password_email_code, which is the default for any
 * trainer with a password set). The Continue button does the right
 * thing server-side (Clerk returns 200 with the factor list) but
 * the widget never renders the chooser, so the user is stuck on
 * the email screen forever.
 *
 * This custom flow drives the same client-side SDK directly via
 * `useSignIn()`. Steps:
 *
 *   1. Email input → `signIn.create({ identifier })`.
 *      If the response status is `complete` (rare — only if Clerk
 *      authenticated us from an existing session cookie), activate
 *      and route. Otherwise the response carries
 *      `supportedFirstFactors` and we move to step 2.
 *
 *   2. Factor chooser. Default to password if the account has it;
 *      surface email-code as an alternative; surface
 *      reset-password-email-code as a "forgot password?" link that
 *      sends a reset OTP.
 *
 *   3a. Password path → `signIn.attemptFirstFactor({ strategy: "password", password })`.
 *
 *   3b. Email-code path → `signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId })`
 *       then user enters the 6-digit code →
 *       `signIn.attemptFirstFactor({ strategy: "email_code", code })`.
 *
 *   4. On `complete`: `setActive({ session: signIn.createdSessionId })` and
 *      router.push("/me") — the same post-sign-in router the
 *      prebuilt would have used (per
 *      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL).
 *
 * Errors from Clerk are surfaced inline (red text below the
 * relevant input). The `clerkError` helper extracts the most
 * specific message Clerk returned — they nest the real reason
 * inside `errors[0].longMessage` / `.message`.
 *
 * Sign-up still uses the prebuilt `<SignUp/>` — it doesn't hit the
 * factor-chooser bug because new accounts only have email_code as a
 * first factor at create-time. Keep it simple unless we see that
 * surface break too.
 */
export function SignInForm({ signUpUrl = "/sign-up" }: { signUpUrl?: string }) {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();

  const [step, setStep] = useState<
    | { kind: "identifier" }
    | { kind: "factors"; email: string }
    | { kind: "password"; email: string }
    | { kind: "email_code"; email: string; emailAddressId: string }
    | { kind: "reset_password"; email: string; emailAddressId: string }
  >({ kind: "identifier" });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Available factors derived from the SDK's resource. Empty array
   * before the user submits an email; populated after step 1. */
  const factors = signIn?.supportedFirstFactors ?? [];
  const hasPassword = factors.some((f) => f.strategy === "password");
  const emailCodeFactor = factors.find(
    (f) => f.strategy === "email_code",
  ) as { strategy: "email_code"; emailAddressId: string } | undefined;
  const resetFactor = factors.find(
    (f) => f.strategy === "reset_password_email_code",
  ) as { strategy: "reset_password_email_code"; emailAddressId: string } | undefined;

  /* ─── Step 1: submit email ───────────────────────────────────── */
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn || busy) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.create({ identifier: trimmed });
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        router.push("/me");
        return;
      }
      if (res.status === "needs_first_factor") {
        /* Pick the default UI step from the strategies the account
         * actually supports. Password if available, otherwise email
         * code, otherwise show the chooser. */
        if (
          res.supportedFirstFactors?.some((f) => f.strategy === "password")
        ) {
          setStep({ kind: "password", email: trimmed });
        } else {
          const ec = res.supportedFirstFactors?.find(
            (f) => f.strategy === "email_code",
          ) as { strategy: "email_code"; emailAddressId: string } | undefined;
          if (ec) {
            await signIn.prepareFirstFactor({
              strategy: "email_code",
              emailAddressId: ec.emailAddressId,
            });
            setStep({ kind: "email_code", email: trimmed, emailAddressId: ec.emailAddressId });
          } else {
            setStep({ kind: "factors", email: trimmed });
          }
        }
        return;
      }
      setError(`Unexpected sign-in state: ${res.status}. Try again.`);
    } catch (err) {
      setError(clerkError(err) ?? "Couldn't start sign-in. Check the email and try again.");
    } finally {
      setBusy(false);
    }
  }

  /* ─── Step 2: switch among factors ───────────────────────────── */
  async function useEmailCodeInstead() {
    if (!isLoaded || !signIn || !emailCodeFactor) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: emailCodeFactor.emailAddressId,
      });
      setStep({
        kind: "email_code",
        email: email,
        emailAddressId: emailCodeFactor.emailAddressId,
      });
    } catch (err) {
      setError(clerkError(err) ?? "Couldn't send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendResetCode() {
    if (!isLoaded || !signIn || !resetFactor) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.prepareFirstFactor({
        strategy: "reset_password_email_code",
        emailAddressId: resetFactor.emailAddressId,
      });
      setStep({
        kind: "reset_password",
        email: email,
        emailAddressId: resetFactor.emailAddressId,
      });
    } catch (err) {
      setError(clerkError(err) ?? "Couldn't send a reset code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /* ─── Step 3a: password ──────────────────────────────────────── */
  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn || busy) return;
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "password",
        password,
      });
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        router.push("/me");
        return;
      }
      /* Clerk's risk scorer returns `needs_client_trust` when it
       * wants a Turnstile CAPTCHA token before completing the
       * password sign-in. clerk-js 5.x literally has "not supported
       * yet" baked into its bundle for this state — there's no API
       * to satisfy the challenge from the client. Auto-pivot to the
       * email-code factor (which doesn't trip the same scorer)
       * rather than leave the trainer on a dead-end error. */
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      if ((res.status as any) === "needs_client_trust" && emailCodeFactor) {
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        const currentEmail =
          step.kind === "password" ? step.email : email.trim();
        setStep({
          kind: "email_code",
          email: currentEmail,
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setError(
          "Password sign-in needs a security check we can't complete here yet. " +
            "We sent you a 6-digit code instead — paste it below.",
        );
        return;
      }
      setError(`Unexpected state after password: ${res.status}.`);
    } catch (err) {
      setError(clerkError(err) ?? "That password didn't work. Try again, or use email code.");
    } finally {
      setBusy(false);
    }
  }

  /* ─── Step 3b: email code ────────────────────────────────────── */
  async function submitEmailCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn || busy) return;
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code,
      });
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        router.push("/me");
        return;
      }
      setError(`Unexpected state after code: ${res.status}.`);
    } catch (err) {
      setError(clerkError(err) ?? "That code didn't work. Check your email and try again.");
    } finally {
      setBusy(false);
    }
  }

  /* ─── Step 3c: reset password ────────────────────────────────── */
  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn || busy) return;
    if (!code || !newPassword) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPassword,
      });
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        router.push("/me");
        return;
      }
      setError(`Unexpected state after reset: ${res.status}.`);
    } catch (err) {
      setError(clerkError(err) ?? "Couldn't reset the password. Check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setError(null);
    setStep({ kind: "identifier" });
    setPassword("");
    setCode("");
    setNewPassword("");
  }

  /* ─── Render ────────────────────────────────────────────────── */

  if (!isLoaded) {
    return (
      <div className="w-full max-w-sm">
        <div className="h-11 animate-pulse rounded-full bg-[color:var(--color-parchment)]" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      {step.kind === "identifier" ? (
        <form onSubmit={submitEmail} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="signin-email">email</Label>
            <Input
              id="signin-email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
            />
          </div>
          {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
          <Button type="submit" size="lg" disabled={busy || !email.trim()}>
            {busy ? "checking…" : "continue"}
          </Button>
          <p className="text-center text-xs text-[color:var(--color-stone)]">
            new here?{" "}
            <a href={signUpUrl} className="font-medium text-[color:var(--color-moss-deep)] underline underline-offset-4">
              sign up
            </a>
          </p>
        </form>
      ) : null}

      {step.kind === "password" ? (
        <form onSubmit={submitPassword} className="flex flex-col gap-4">
          <p className="text-xs text-[color:var(--color-ink)]/70">
            signing in as <span className="font-medium">{step.email}</span>
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="signin-password">password</Label>
            <Input
              id="signin-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
          <Button type="submit" size="lg" disabled={busy || !password}>
            {busy ? "signing in…" : "sign in"}
          </Button>

          {/* "Use email code instead" is promoted into its own
            * bordered chip below the sign-in button — subtly more
            * visible than the other secondary links because it's
            * the practical fallback when Clerk's risk scorer
            * blocks the password attempt with `needs_client_trust`
            * (auto-pivots in submitPassword, but discoverable here
            * too). `forgot password?` and `use a different email`
            * stay as smaller text links beneath. */}
          {emailCodeFactor ? (
            <button
              type="button"
              onClick={useEmailCodeInstead}
              disabled={busy}
              className="mt-1 inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-5 text-sm font-medium text-[color:var(--color-ink)] transition-colors hover:border-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              email me a code instead
            </button>
          ) : null}

          <div className="flex flex-col gap-2 text-center text-xs text-[color:var(--color-stone)]">
            {resetFactor ? (
              <button
                type="button"
                onClick={sendResetCode}
                disabled={busy}
                className="font-medium text-[color:var(--color-moss-deep)] underline underline-offset-4 disabled:opacity-60"
              >
                forgot password?
              </button>
            ) : null}
            <button
              type="button"
              onClick={back}
              disabled={busy}
              className="text-[color:var(--color-stone)] underline underline-offset-4 disabled:opacity-60"
            >
              use a different email
            </button>
          </div>
        </form>
      ) : null}

      {step.kind === "factors" ? (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[color:var(--color-ink)]/70">
            signing in as <span className="font-medium">{step.email}</span>
          </p>
          {hasPassword ? (
            <Button onClick={() => setStep({ kind: "password", email: step.email })} size="lg">
              use password
            </Button>
          ) : null}
          {emailCodeFactor ? (
            <Button variant="outline" size="lg" onClick={useEmailCodeInstead} disabled={busy}>
              {busy ? "sending…" : "email me a code"}
            </Button>
          ) : null}
          {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
          <button
            type="button"
            onClick={back}
            disabled={busy}
            className="text-center text-xs text-[color:var(--color-stone)] underline underline-offset-4 disabled:opacity-60"
          >
            use a different email
          </button>
        </div>
      ) : null}

      {step.kind === "email_code" ? (
        <form onSubmit={submitEmailCode} className="flex flex-col gap-4">
          <p className="text-xs text-[color:var(--color-ink)]/70">
            we sent a 6-digit code to <span className="font-medium">{step.email}</span>
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="signin-code">code</Label>
            <Input
              id="signin-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D+/g, ""))}
              disabled={busy}
            />
          </div>
          {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
          <Button type="submit" size="lg" disabled={busy || code.length < 6}>
            {busy ? "verifying…" : "sign in"}
          </Button>
          <div className="flex flex-col gap-2 text-center text-xs text-[color:var(--color-stone)]">
            {hasPassword ? (
              <button
                type="button"
                onClick={() => setStep({ kind: "password", email: step.email })}
                disabled={busy}
                className="font-medium text-[color:var(--color-moss-deep)] underline underline-offset-4 disabled:opacity-60"
              >
                use password instead
              </button>
            ) : null}
            <button
              type="button"
              onClick={back}
              disabled={busy}
              className="text-[color:var(--color-stone)] underline underline-offset-4 disabled:opacity-60"
            >
              use a different email
            </button>
          </div>
        </form>
      ) : null}

      {step.kind === "reset_password" ? (
        <form onSubmit={submitReset} className="flex flex-col gap-4">
          <p className="text-xs text-[color:var(--color-ink)]/70">
            we sent a 6-digit reset code to <span className="font-medium">{step.email}</span>
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-code">code</Label>
            <Input
              id="reset-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D+/g, ""))}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-pw">new password</Label>
            <Input
              id="reset-pw"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
          <Button type="submit" size="lg" disabled={busy || code.length < 6 || newPassword.length < 8}>
            {busy ? "resetting…" : "reset & sign in"}
          </Button>
          <button
            type="button"
            onClick={back}
            disabled={busy}
            className="text-center text-xs text-[color:var(--color-stone)] underline underline-offset-4 disabled:opacity-60"
          >
            cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}

/* Clerk wraps its API errors in a `ClerkAPIResponseError` shape we
 * don't want to import a runtime check for. Defensive structural
 * unwrap: try a few known shapes, fall back to the bare Error
 * message, then to null. */
function clerkError(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (typeof err !== "object") return null;
  const e = err as {
    errors?: Array<{ message?: string; longMessage?: string; code?: string }>;
    message?: string;
  };
  const first = e.errors?.[0];
  if (first) {
    return first.longMessage ?? first.message ?? null;
  }
  return e.message ?? null;
}
