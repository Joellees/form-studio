"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { claimInvite } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClaimInviteButton({ code, defaultPhone }: { code: string; defaultPhone: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [error, setError] = useState<string | null>(null);

  function onClaim() {
    setError(null);
    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }
    startTransition(async () => {
      const r = await claimInvite({ code, phone: phone.trim() });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/client/dashboard");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">phone number</Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+961 70 000 000"
          autoComplete="tel"
        />
      </div>
      <Button onClick={onClaim} disabled={pending} size="lg">
        {pending ? "accepting…" : "accept invite"}
      </Button>
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
    </div>
  );
}
