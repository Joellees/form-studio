"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setActiveStudio } from "./actions";

type Membership = {
  tenantId: string;
  trainerName: string;
  subdomainSlug: string | null;
};

export function PickStudio({ memberships }: { memberships: Membership[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function pick(tenantId: string) {
    setBusy(tenantId);
    startTransition(async () => {
      const result = await setActiveStudio({ tenantId });
      if (!result.ok) {
        alert(result.error);
        setBusy(null);
        return;
      }
      router.push("/client");
    });
  }

  return (
    <ul className="mt-8 space-y-2">
      {memberships.map((m) => (
        <li key={m.tenantId}>
          <button
            type="button"
            onClick={() => pick(m.tenantId)}
            disabled={pending}
            className="flex w-full items-center justify-between rounded-2xl bg-[color:var(--color-parchment)]/70 px-5 py-4 text-left transition-colors hover:bg-[color:var(--color-parchment)] disabled:opacity-60"
          >
            <span>
              <span className="block text-base font-semibold tracking-tight">
                {m.trainerName}
              </span>
              {m.subdomainSlug ? (
                <span className="mt-0.5 block text-xs text-[color:var(--color-stone)]">
                  {m.subdomainSlug}.formstudio.com
                </span>
              ) : null}
            </span>
            <span className="text-xs font-medium text-[color:var(--color-stone)]">
              {busy === m.tenantId ? "opening…" : "open →"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
