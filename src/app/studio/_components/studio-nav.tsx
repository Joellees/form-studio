"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/studio/dashboard", label: "overview" },
  { href: "/studio/clients", label: "clients" },
  { href: "/studio/calendar", label: "calendar" },
  { href: "/studio/library", label: "library" },
  { href: "/studio/templates", label: "templates" },
  { href: "/studio/packages", label: "packages" },
];

export function StudioNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-6 text-sm">
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
            {active ? (
              <span
                aria-hidden
                className="mx-auto mt-1 block h-[2px] w-4 rounded-full bg-[color:var(--color-moss)]"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
