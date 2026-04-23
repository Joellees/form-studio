"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { claimInvite } from "./actions";
import { Button } from "@/components/ui/button";

export function ClaimInviteButton({ code }: { code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClaim() {
    setError(null);
    startTransition(async () => {
      const r = await claimInvite(code);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/client/dashboard");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={onClaim} disabled={pending} size="lg">
        {pending ? "accepting…" : "accept invite"}
      </Button>
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
    </div>
  );
}
