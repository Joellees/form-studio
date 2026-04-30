"use client";

import { useState } from "react";

/**
 * One-shot welcome card with a copy-able sign-in URL. Shown only when
 * the client lands on the portal with `?welcome=1` straight off the
 * invite-claim flow. Closing it stays closed until they hit `?welcome=1`
 * again — no localStorage, the URL is the source of truth.
 */
export function WelcomeBanner({
  trainerName,
  signInUrl,
}: {
  trainerName: string;
  signInUrl: string;
}) {
  const [closed, setClosed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (closed) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(signInUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — some browsers block clipboard without focus
    }
  }

  return (
    <div className="rounded-3xl border border-[color:var(--color-moss)]/30 bg-[color:var(--color-moss)]/5 px-6 py-5 md:px-8 md:py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss-deep)]">
            your portal
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight md:text-xl">
            You&rsquo;re training with {trainerName}.
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-ink)]/75">
            This is your client portal — calendar, packages, notes to {trainerName}.
            Bookmark the sign-in link below so you can come back anytime.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-full bg-[color:var(--color-canvas)] px-3 py-1.5 text-xs tabular-nums text-[color:var(--color-ink)]">
              {signInUrl}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-9 items-center rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
            >
              {copied ? "copied" : "copy link"}
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="dismiss"
          onClick={() => setClosed(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink)]/60 hover:bg-[color:var(--color-canvas)]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
