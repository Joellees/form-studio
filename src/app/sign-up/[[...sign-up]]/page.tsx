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
      {/*
        `appearance.elements.card` was a v5-era override. The Clerk v6
        appearance API renamed several element keys; passing the v5-shaped
        `{ card: "shadow-none bg-transparent" }` against a 6.x SDK caused
        a render-time crash that surfaced as the generic "Something broke"
        error boundary. Removed for v6 compatibility. If we want the card
        to render without a shadow / transparent again, re-add it using
        the v6 key names once we've confirmed the SDK is happy.
      */}
      <SignUp fallbackRedirectUrl="/me" signInUrl="/sign-in" />
    </main>
  );
}
