import Link from "next/link";

import { NewTemplateForm } from "./new-template-form";

export default function NewTemplatePage() {
  return (
    <div className="mx-auto max-w-xl rise-in">
      <Link
        href="/studio/library?tab=workouts"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path
            d="M6.5 1.5L3 5l3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        back to workouts
      </Link>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
        templates
      </p>
      <h1 className="mt-2 text-3xl md:text-4xl">New template.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Name your session. You&rsquo;ll add exercises and set groups on the next screen.
      </p>
      <NewTemplateForm />
    </div>
  );
}
