import { Wordmark } from "@/components/brand/wordmark";

import { SignInForm } from "./sign-in-form";

/**
 * Returning-trainer sign-in.
 *
 * We bypass Clerk's prebuilt `<SignIn/>` here because of a state-
 * machine bug in clerk-js 5.x that locks the widget on the email
 * screen when the account has multiple `supported_first_factors`
 * (which is every account with a password set, since Clerk
 * automatically attaches `email_code` + `reset_password_email_code`
 * alongside it). See `./sign-in-form.tsx` for the long-form
 * explanation and the steps the custom flow walks through.
 *
 * Sign-up still uses the prebuilt — new accounts only have one
 * first-factor at create-time so the same bug doesn't bite.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="mb-10 rise-in">
        <Wordmark variant="inline-platform" />
      </div>
      <SignInForm signUpUrl="/sign-up" />
    </main>
  );
}
