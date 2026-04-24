"use client";

import { useState, useTransition } from "react";

import { updateSubscription } from "@/app/studio/subscriptions/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Sub = {
  id: string;
  sessions_remaining: number;
  start_date: string | null;
  end_date: string | null;
  package_name: string | null;
  package_session_count: number | null;
};

/**
 * Editable view of a client&rsquo;s active block. Shows the headline package
 * info and lets the trainer tweak sessions remaining, start and end dates
 * without leaving the client page.
 */
export function SubscriptionEditor({ sub }: { sub: Sub }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const [remaining, setRemaining] = useState(sub.sessions_remaining);
  const [startDate, setStartDate] = useState(sub.start_date ?? "");
  const [endDate, setEndDate] = useState(sub.end_date ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateSubscription({
        id: sub.id,
        sessions_remaining: remaining,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="grid gap-6 md:grid-cols-4">
        <Detail label="package" value={sub.package_name ?? "Package"} />
        <Detail
          label="sessions"
          value={`${sub.sessions_remaining} of ${sub.package_session_count ?? "—"} left`}
        />
        <Detail label="started" value={fmt(sub.start_date)} />
        <Detail label="ends" value={fmt(sub.end_date)} />
        <div className="md:col-span-4">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            edit block
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-5 md:grid-cols-3">
      <FieldInput label="sessions left">
        <Input
          type="number"
          min={0}
          value={remaining}
          onChange={(e) => setRemaining(Number(e.target.value) || 0)}
        />
      </FieldInput>
      <FieldInput label="start date">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </FieldInput>
      <FieldInput label="end date">
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </FieldInput>
      <div className="flex items-center gap-3 md:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "saving…" : "save"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          cancel
        </Button>
      </div>
    </form>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--color-ink)]">{value}</p>
    </div>
  );
}

function FieldInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
