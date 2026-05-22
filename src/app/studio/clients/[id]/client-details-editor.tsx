"use client";

import { useState, useTransition } from "react";

import { updateClientDetails } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

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
  const toast = useToast();
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
        toast.error(result.error);
        return;
      }
      toast.success("client details saved.");
      setEditing(false);
    });
  }

  if (!editing) {
    /* Three Detail blocks (goals / injuries / notes) used to render
     * unconditionally — each showed "—" when the field was empty.
     * For a freshly-added client with nothing filled in that was
     * three "—" rows of wasted vertical space + an edit button at
     * the bottom. Now: only the filled fields render. When none
     * are filled, the panel collapses to a single "add details"
     * CTA. The card around this still says "Details" via
     * CardHeader, so the empty state reads as
     * "Details — add details" instead of three em-dashes. */
    const filled: Array<{ label: string; value: string }> = [];
    if (client.goals) filled.push({ label: "goals", value: client.goals });
    if (client.injuries) filled.push({ label: "injuries", value: client.injuries });
    if (client.notes) filled.push({ label: "notes", value: client.notes });

    if (filled.length === 0) {
      return (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          add details
        </Button>
      );
    }

    return (
      <div className="space-y-5">
        {filled.map((d) => (
          <Detail key={d.label} label={d.label} value={d.value} />
        ))}
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          edit details
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldInput label="name">
          <Input
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          />
        </FieldInput>
        <FieldInput label="email">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </FieldInput>
        <FieldInput label="phone">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
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
