import Link from "next/link";

import { NewTemplateForm } from "./new-template-form";
import { PageHeader } from "@/components/ui/page-header";

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
      <div className="mt-6">
        <PageHeader
          eyebrow="workouts"
          title="New workout."
          subtitle="name your session. you'll add exercises and set groups on the next screen."
        />
      </div>
      <NewTemplateForm />
    </div>
  );
}
