"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { assignPackage } from "@/app/studio/subscriptions/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";

type Package = {
  id: string;
  name: string;
  session_count: number;
  duration_days: number;
  price_usd: number;
};

export function AssignPackageButton({
  clientId,
  packages,
}: {
  clientId: string;
  packages: Package[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [markPaid, setMarkPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function save() {
    setError(null);
    if (!packageId) return;
    startTransition(async () => {
      const result = await assignPackage({ clientId, packageId, markPaid });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (packages.length === 0) {
    return (
      <p className="text-xs text-[color:var(--color-stone)]">
        Create a package first before assigning one.
      </p>
    );
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        assign a package
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 p-4 md:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[color:var(--color-canvas)] p-6 shadow-[0_24px_64px_-12px_rgba(31,30,27,0.35)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
              new block
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Assign a package</h2>
            <p className="mt-2 text-sm text-[color:var(--color-ink)]/70">
              Picks a package, seeds the dates, and either marks it paid so the sessions unlock
              now or leaves it pending your payment confirmation.
            </p>

            <div className="mt-5 flex flex-col gap-4">
              <Select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.session_count} sessions · ${p.price_usd.toLocaleString()}
                  </option>
                ))}
              </Select>

              <div className="flex items-center justify-between rounded-2xl bg-[color:var(--color-parchment)] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">mark as paid</p>
                  <p className="text-xs text-[color:var(--color-ink)]/70">
                    Sessions unlock immediately. Leave off if payment is pending.
                  </p>
                </div>
                <Toggle checked={markPaid} onChange={setMarkPaid} />
              </div>

              {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                cancel
              </Button>
              <Button onClick={save} disabled={pending || !packageId}>
                {pending ? "assigning…" : "assign"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
