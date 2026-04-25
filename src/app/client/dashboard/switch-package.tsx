"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { switchPackageNextCycle } from "@/app/studio/subscriptions/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type Package = {
  id: string;
  name: string;
  session_count: number;
  price_usd: number;
};

/**
 * Client-side switch-on-next-cycle picker. The change is queued via
 * pending_package_id and applies when the subscription renews; the
 * current month stays as-is. Selecting the same package as today
 * clears any pending change.
 */
export function SwitchPackageNextCycle({
  subscriptionId,
  currentPackageId,
  pendingPackageId,
  packages,
  nextRenewal,
}: {
  subscriptionId: string;
  currentPackageId: string;
  pendingPackageId: string | null;
  packages: Package[];
  nextRenewal: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(pendingPackageId ?? currentPackageId);
  const [error, setError] = useState<string | null>(null);

  const pendingPackage = packages.find((p) => p.id === pendingPackageId);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await switchPackageNextCycle({
        subscriptionId,
        packageId: choice === currentPackageId ? null : choice,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            next month
          </p>
          <p className="mt-1 text-sm text-[color:var(--color-ink)]">
            {pendingPackage ? (
              <>
                switching to <span className="font-semibold">{pendingPackage.name}</span>
                {nextRenewal ? (
                  <span className="text-[color:var(--color-ink)]/60"> · on {fmtDate(nextRenewal)}</span>
                ) : null}
              </>
            ) : (
              <span className="text-[color:var(--color-ink)]/70">
                same package renews
                {nextRenewal ? ` on ${fmtDate(nextRenewal)}` : ""}
              </span>
            )}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          {pendingPackage ? "change" : "switch package"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[color:var(--color-ink)]/70">
        Pick what you want for next month. The current month stays the same.
      </p>
      <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id === currentPackageId ? "✓ keep " : ""}
            {p.name} — {p.session_count} sessions / month · ${p.price_usd.toLocaleString()}
          </option>
        ))}
      </Select>
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "saving…" : "save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setChoice(pendingPackageId ?? currentPackageId);
          }}
          disabled={pending}
        >
          cancel
        </Button>
      </div>
    </div>
  );
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
