import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

/**
 * Root marketing page at formstudio.com.
 * Trainer subdomains are rewritten to /s/[slug] in middleware; this file
 * never renders for those hosts.
 */
export default function RootPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Wordmark variant="inline-platform" />
        <nav className="hidden items-center gap-8 text-sm text-[color:var(--color-ink)] md:flex">
          <Link href="#approach" className="hover:text-[color:var(--color-moss-deep)]">
            approach
          </Link>
          <Link href="#get-started" className="hover:text-[color:var(--color-moss-deep)]">
            get started
          </Link>
        </nav>
      </header>

      <section className="mt-28 max-w-3xl rise-in">
        <p className="mb-8 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
          form studio · training, by hand
        </p>
        <h1 className="font-display text-[clamp(3rem,8vw,5.75rem)] leading-[0.95]">
          The studio software for trainers who think like <em className="italic" style={{ fontVariationSettings: '"WONK" 1, "SOFT" 40, "opsz" 144' }}>craftspeople</em>.
        </h1>
        <p className="mt-8 max-w-xl text-lg text-[color:var(--color-ink)]/80">
          One studio. Your subdomain. Your exercise library, your session
          templates, your clients&rsquo; calendar — all in a space that looks and reads like
          yours.
        </p>
      </section>

      <section id="get-started" className="mt-20 flex flex-col items-start gap-4 rise-in">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/sign-up"
            className="inline-flex h-12 items-center rounded-full bg-[color:var(--color-ink)] px-7 text-[15px] font-medium text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.15),0_6px_18px_-8px_rgba(31,30,27,0.35)] hover:bg-[color:var(--color-moss-deep)]"
          >
            create your studio
          </Link>
          <Link
            href="/sign-in"
            className="text-sm text-[color:var(--color-ink)]/70 underline underline-offset-4 hover:text-[color:var(--color-ink)]"
          >
            already have one? sign in
          </Link>
        </div>
        <p className="text-xs text-[color:var(--color-stone)]">
          Clients — don&rsquo;t sign up here. Your trainer will send you an invite link.
        </p>
      </section>

      <section id="approach" className="mt-32 grid gap-16 border-t border-[color:var(--color-stone-soft)] pt-16 md:grid-cols-3">
        <Pillar
          index="01"
          title="your repertoire, reusable"
          body="Build your exercise library once. Every cue, every video, every set scheme stays — then appears, clean, inside every client&rsquo;s workout."
        />
        <Pillar
          index="02"
          title="one calendar, two sides"
          body="Trainers push-schedule. Clients request. Cancellation rules enforced by the server, not a spreadsheet."
        />
        <Pillar
          index="03"
          title="a page that looks like you"
          body="Your subdomain. Your cover. Your voice. No one mistakes it for a gym-app template."
        />
      </section>

      <footer className="mt-auto border-t border-[color:var(--color-stone-soft)] pt-10 pb-4 text-xs text-[color:var(--color-stone)]">
        <div className="flex items-center justify-between">
          <span>&copy; {new Date().getFullYear()} Form Studio</span>
          <span className="uppercase tracking-[0.26em]">made for trainers</span>
        </div>
      </footer>
    </main>
  );
}

function Pillar({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div>
      <span className="text-xs font-medium tracking-widest text-[color:var(--color-stone)]">{index}</span>
      <h3 className="mt-4 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm text-[color:var(--color-ink)]/75">{body}</p>
    </div>
  );
}
