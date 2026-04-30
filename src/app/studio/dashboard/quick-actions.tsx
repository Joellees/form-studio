"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Top-right action cluster on the dashboard. Three actions, all
 * one-click: jump to a creation flow, or grab the share link.
 *
 * "Share studio link" copies the public studio URL to the clipboard.
 * It's a client component because window.navigator isn't on the
 * server, and the chip needs a little "copied" confirmation state.
 */
export function QuickActions({ studioUrl }: { studioUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copyStudio() {
    if (!studioUrl) return;
    try {
      await navigator.clipboard.writeText(studioUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Some browsers block clipboard without user gesture; ignore.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/studio/clients/new"
        className="inline-flex h-11 items-center rounded-full bg-[color:var(--color-ink)] px-3.5 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
      >
        invite client
      </Link>
      <Link
        href="/studio/packages/new"
        className="inline-flex h-11 items-center rounded-full border border-[color:var(--color-ink)]/15 bg-[color:var(--color-canvas)] px-3.5 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
      >
        new package
      </Link>
      {studioUrl ? (
        <button
          type="button"
          onClick={copyStudio}
          className="inline-flex h-11 items-center rounded-full border border-[color:var(--color-ink)]/15 bg-[color:var(--color-canvas)] px-3.5 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
        >
          {copied ? "copied" : "share studio link"}
        </button>
      ) : null}
    </div>
  );
}
