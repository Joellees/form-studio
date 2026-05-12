import { SignIn } from "@clerk/nextjs";

import { Wordmark } from "@/components/brand/wordmark";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="mb-10 rise-in">
        <Wordmark variant="inline-platform" />
      </div>
      {/*
        `appearance.elements.card` was a v5-era override. See the
        matching comment in `/sign-up/page.tsx` — removed for v6
        compatibility after the override crashed the prebuilt
        component at render time.
      */}
      <SignIn fallbackRedirectUrl="/me" signUpUrl="/sign-up" />
    </main>
  );
}
