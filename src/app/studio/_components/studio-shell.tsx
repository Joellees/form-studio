import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { StudioNav } from "./studio-nav";
import { Wordmark } from "@/components/brand/wordmark";

type Props = {
  trainer: { id: string; display_name: string; subdomain_slug: string };
  children: React.ReactNode;
};

export function StudioShell({ trainer, children }: Props) {
  const firstName = trainer.display_name.split(" ")[0] ?? trainer.display_name;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[color:var(--color-stone-soft)]/50 bg-[color:var(--color-canvas)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-5 py-3 md:gap-8 md:px-8 md:py-5">
          <Link href="/studio/dashboard" aria-label="Dashboard" className="min-w-0">
            <Wordmark variant="inline" name={firstName} />
          </Link>
          <div className="flex items-center gap-2 md:gap-6">
            <StudioNav />
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: "size-8" } }}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-5 py-6 md:px-8 md:py-12">{children}</main>
    </div>
  );
}
