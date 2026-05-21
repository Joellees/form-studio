"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setActiveStudio } from "./pick/actions";
import { useToast } from "@/components/ui/toast";

type Membership = {
  tenantId: string;
  trainerName: string;
  subdomainSlug: string | null;
};

/**
 * Compact dropdown shown in the portal header when a client belongs
 * to more than one studio. Selecting another trainer pins the cookie
 * and reloads — the layout re-resolves the active membership and the
 * page renders that studio's calendar + profile.
 */
export function ClientStudioSwitcher({
  active,
  memberships,
}: {
  active: { tenantId: string; trainerName: string };
  memberships: Membership[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(tenantId: string) {
    setOpen(false);
    if (tenantId === active.tenantId) return;
    startTransition(async () => {
      const result = await setActiveStudio({ tenantId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-[color:var(--color-stone)]">studio</span>
        <span className="font-semibold">{active.trainerName.split(" ")[0]}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute right-0 top-full z-40 mt-1 min-w-[220px] rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] p-1 shadow-[0_12px_32px_-8px_rgba(31,30,27,0.25)]"
          >
            {memberships.map((m) => (
              <li key={m.tenantId}>
                <button
                  type="button"
                  onClick={() => pick(m.tenantId)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-[color:var(--color-parchment)] ${
                    m.tenantId === active.tenantId ? "font-semibold" : ""
                  }`}
                >
                  <span>{m.trainerName}</span>
                  {m.tenantId === active.tenantId ? (
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-moss-deep)]">
                      active
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
