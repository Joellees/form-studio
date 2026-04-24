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
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-8 py-5">
          <Link href="/studio/dashboard" aria-label="Dashboard">
            <Wordmark variant="inline" name={firstName} />
          </Link>
          <div className="flex items-center gap-8">
            <StudioNav />
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: "size-8" } }}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-8 py-12">{children}</main>
    </div>
  );
}
