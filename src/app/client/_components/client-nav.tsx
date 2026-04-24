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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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

  return (
    <>
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

      <button
        type="button"
        aria-label="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)] md:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          {open ? (
            <>
              <path d="M5 5l10 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M3 6h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M3 10h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M3 14h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 top-[56px] z-30 bg-[color:var(--color-ink)]/30 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <nav className="fixed inset-x-0 top-[56px] z-40 flex flex-col gap-1 bg-[color:var(--color-canvas)] px-5 py-4 shadow-[0_16px_32px_-16px_rgba(31,30,27,0.25)] md:hidden">
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-base font-medium transition-colors",
                    active
                      ? "bg-[color:var(--color-parchment)] text-[color:var(--color-ink)]"
                      : "text-[color:var(--color-ink)]/80 hover:bg-[color:var(--color-parchment)]/70",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </>
      ) : null}
    </>
  );
}
