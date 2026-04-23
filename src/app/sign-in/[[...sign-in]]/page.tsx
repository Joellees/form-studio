import { SignIn } from "@clerk/nextjs";

import { Wordmark } from "@/components/brand/wordmark";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="mb-10 rise-in">
        <Wordmark variant="inline-platform" />
      </div>
      <SignIn appearance={{ elements: { card: "shadow-none bg-transparent" } }} />
    </main>
  );
}
