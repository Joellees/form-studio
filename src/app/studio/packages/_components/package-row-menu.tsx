"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { archivePackage } from "../actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Per-row kebab menu on the packages list.
 *
 * Two actions:
 *   - edit   → navigates to /studio/packages/[id] (same destination
 *              the package-name link goes to). Surfaced in the menu
 *              for discoverability — trainers asked for an explicit
 *              edit affordance instead of relying on "click the
 *              name" tribal knowledge.
 *   - delete → archives the package via the existing `archivePackage`
 *              server action. We keep the term "delete" in the UI per
 *              the trainer's preferred vocabulary (the action under
 *              the hood is still soft-delete via `archived = true`,
 *              so existing subscriptions continue and the package can
 *              be restored from the archived filter — same shape as
 *              the page-level archive button).
 *
 * Closes on outside click + Escape. Sits as an absolute popover
 * anchored to the right edge of the kebab button.
 */
export function PackageRowMenu({
  packageId,
  packageName,
  active,
}: {
  packageId: string;
  packageName: string;
  active: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement | null>(null);

  /* Click-outside + Escape close the menu. We bind on `open` so the
   * listener isn't running while the menu is closed. */
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current || !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onDelete() {
    setOpen(false);
    const ok = await confirm({
      title: `delete "${packageName}"?`,
      body: "existing subscriptions keep running. new clients won't see this package. you can restore it from the archived view.",
      confirmLabel: "delete",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      await archivePackage(packageId);
      toast.success("package deleted.");
      router.refresh();
    });
  }

  // Only show the delete action when the package is currently
  // active. Archived packages don't have a "delete again" path.
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`actions for ${packageName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-stone)] transition-colors hover:bg-[color:var(--color-parchment)] hover:text-[color:var(--color-ink)]",
          open && "bg-[color:var(--color-parchment)] text-[color:var(--color-ink)]",
          pending && "opacity-60",
        )}
      >
        <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden>
          <circle cx="2" cy="2" r="1.6" />
          <circle cx="2" cy="8" r="1.6" />
          <circle cx="2" cy="14" r="1.6" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-2xl bg-[color:var(--color-canvas)] py-1 ring-1 ring-inset ring-[color:var(--color-ink)]/8 shadow-[0_12px_32px_-8px_rgba(31,30,27,0.25)]"
        >
          <Link
            href={`/studio/packages/${packageId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-parchment)]/60"
          >
            edit
          </Link>
          {active ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => void onDelete()}
              className="block w-full px-4 py-2 text-left text-sm text-[color:var(--color-sienna)] transition-colors hover:bg-[color:var(--color-parchment)]/60"
            >
              delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
