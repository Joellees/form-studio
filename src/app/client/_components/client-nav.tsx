"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/client/dashboard", label: "overview" },
  { href: "/client/calendar", label: "calendar" },
  { href: "/client/logs", label: "logs" },
];

export function ClientNav() {
  return (
    <>
      <DesktopNav />
      <MobileNav />
    </>
  );
}

function DesktopNav() {
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

export function ClientMobileMenuButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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

  return (
    <>
      <button
        type="button"
        aria-label={open ? "close menu" : "open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-ink)] transition-colors hover:bg-[color:var(--color-parchment)] md:hidden"
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

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[color:var(--color-canvas)] md:hidden">
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
        </div>
      ) : null}
    </>
  );
}

function MobileNav() {
  // MobileNav inside the nav wrapper is empty — we expose the button
  // separately so the parent layout can place it in the correct header
  // slot. This keeps the component tree flat and predictable.
  return null;
}
