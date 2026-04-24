"use client";

import { useState, useTransition } from "react";

import { updateClientDetails } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Details = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  goals: string | null;
  injuries: string | null;
};

export function ClientDetailsEditor({ client }: { client: Details }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    display_name: client.display_name,
    email: client.email ?? "",
    phone: client.phone ?? "",
    notes: client.notes ?? "",
    goals: client.goals ?? "",
    injuries: client.injuries ?? "",
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateClientDetails({
        id: client.id,
        displayName: form.display_name,
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes || null,
        goals: form.goals || null,
        injuries: form.injuries || null,
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
      <div className="space-y-5">
        <Detail label="goals" value={client.goals} />
        <Detail label="injuries" value={client.injuries} />
        <Detail label="notes" value={client.notes} />
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          edit details
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <FieldInput label="name">
          <Input
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          />
        </FieldInput>
        <FieldInput label="email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </FieldInput>
        <FieldInput label="phone">
          <Input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </FieldInput>
      </div>
      <FieldInput label="goals">
        <Textarea
          rows={2}
          value={form.goals}
          onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))}
          placeholder="What they want out of training."
        />
      </FieldInput>
      <FieldInput label="injuries">
        <Textarea
          rows={2}
          value={form.injuries}
          onChange={(e) => setForm((f) => ({ ...f, injuries: e.target.value }))}
          placeholder="Anything to work around or avoid."
        />
      </FieldInput>
      <FieldInput label="notes">
        <Textarea
          rows={3}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Private notes for your eyes only."
        />
      </FieldInput>
      <div className="flex items-center gap-3">
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

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--color-ink)]/85">
        {value || <span className="text-[color:var(--color-stone)]">—</span>}
      </p>
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
