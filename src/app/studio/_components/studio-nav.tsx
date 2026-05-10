"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/studio/dashboard", label: "overview" },
  { href: "/studio/clients", label: "clients" },
  { href: "/studio/calendar", label: "calendar" },
  { href: "/studio/library", label: "library" },
  { href: "/studio/packages", label: "packages" },
];

/**
 * Responsive nav. On desktop renders the horizontal link row. On mobile
 * it renders nothing — the parent shell places `<MobileMenuButton />` in
 * its own slot of the header (left edge), and the button owns the
 * full-screen drawer state.
 */
export function StudioNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-6 text-sm md:flex">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "transition-colors",
              active
                ? "text-[color:var(--color-moss-deep)]"
                : "text-[color:var(--color-ink)]/70 hover:text-[color:var(--color-moss-deep)]",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMenuButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The drawer is portalled to document.body so it escapes the
  // sticky header's containing block. The header carries
  // `backdrop-blur` (i.e. backdrop-filter), and per CSS spec a
  // backdrop-filter establishes a containing block for fixed
  // descendants — without the portal the drawer's `inset-0` was
  // being clipped to the header strip instead of filling the
  // viewport.
  const drawer =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex flex-col bg-[color:var(--color-canvas)] md:hidden"
            role="dialog"
            aria-modal="true"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div className="flex items-center justify-end px-3 py-3">
              <button
                type="button"
                aria-label="close menu"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-parchment)]"
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
                  <path d="M6 6l10 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  <path d="M16 6L6 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pb-10">
              {LINKS.map((l) => {
                const active = pathname === l.href || pathname.startsWith(l.href + "/");
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "flex items-center rounded-2xl px-5 py-4 text-lg font-semibold tracking-tight transition-colors",
                      active
                        ? "bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]"
                        : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]",
                    )}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        aria-label={open ? "close menu" : "open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-parchment)] active:bg-[color:var(--color-stone-soft)] md:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
          {open ? (
            <>
              <path d="M6 6l10 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M16 6L6 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M4 7h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M4 11h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M4 15h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>
      {drawer}
    </>
  );
}
