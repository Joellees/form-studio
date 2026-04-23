import { SignUp } from "@clerk/nextjs";

import { Wordmark } from "@/components/brand/wordmark";

/**
 * First leg of trainer onboarding. After sign-up, Clerk redirects to
 * /onboarding where we collect subdomain and profile details.
 */
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="mb-10 rise-in">
        <Wordmark variant="inline-platform" />
      </div>
      <SignUp
        fallbackRedirectUrl="/onboarding"
        signInUrl="/sign-in"
        appearance={{ elements: { card: "shadow-none bg-transparent" } }}
      />
    </main>
  );
}
