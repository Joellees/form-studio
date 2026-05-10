import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { MobileMenuButton, StudioNav } from "./studio-nav";
import { Wordmark } from "@/components/brand/wordmark";

type Props = {
  trainer: { id: string; display_name: string; subdomain_slug: string };
  children: React.ReactNode;
};

/**
 * Three-zone sticky header.
 * Mobile: [☰] [Form Studio] [avatar]
 * Desktop: [Joelle's Form Studio]         [nav links] [avatar]
 */
export function StudioShell({ trainer, children }: Props) {
  const firstName = trainer.display_name.split(" ")[0] ?? trainer.display_name;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[color:var(--color-stone-soft)]/50 bg-[color:var(--color-canvas)]/85 backdrop-blur">
        <div className="mx-auto grid max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 md:flex md:justify-between md:gap-6 md:px-8 md:py-4">
          {/* Left: hamburger on mobile, wordmark on desktop */}
          <div className="flex items-center md:hidden">
            <MobileMenuButton />
          </div>
          <Link
            href="/studio/dashboard"
            aria-label="Dashboard"
            className="flex items-center justify-center md:justify-start"
          >
            <Wordmark variant="inline" name={firstName} />
          </Link>

          {/* Right: nav links (desktop only) + avatar */}
          <div className="flex items-center justify-end gap-4 md:gap-6">
            <StudioNav />
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: "size-8" } }}
            />
          </div>
        </div>
      </header>
      <main
        // overflow-x-clip is the per-element belt to body's
        // overflow-x: clip suspenders — any child page that produces
        // a too-wide row (long client name, untruncated string,
        // tabular cell) gets clipped at the main content rail rather
        // than pushing the whole layout sideways on mobile.
        className="mx-auto max-w-[1200px] overflow-x-clip px-5 py-6 md:px-8 md:py-12"
        style={{
          // Reserve space for the iOS home bar / chrome so primary
          // CTAs at the end of long pages stay reachable. Desktop
          // gets a flat 3rem bottom padding for footer breathing room.
          paddingBottom:
            "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
