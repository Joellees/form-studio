"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { createInvite } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Values = {
  displayName: string;
  email: string;
  phone: string;
  notes: string;
};

export function InviteGenerator() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { register, handleSubmit, formState: { errors }, setError } = useForm<Values>();

  function onSubmit(values: Values) {
    startTransition(async () => {
      const result = await createInvite(values);
      if (!result.ok) {
        setError("displayName", { message: result.error });
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setInviteUrl(`${origin}/invite/${result.data.code}`);
    });
  }

  async function copy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (inviteUrl) {
    return (
      <div className="mt-10 flex flex-col gap-6 rise-in">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            invite ready
          </p>
          <p className="mt-2 text-[color:var(--color-ink)]/75">
            Share this link with your client. It works once.
          </p>
        </div>
        <div className="flex items-stretch overflow-hidden rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)]">
          <input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-transparent px-5 py-3 text-sm text-[color:var(--color-ink)] focus:outline-none"
          />
          <button
            type="button"
            onClick={copy}
            className="border-l border-[color:var(--color-stone-soft)] bg-[color:var(--color-ink)] px-5 text-sm font-medium text-[color:var(--color-canvas)] transition hover:bg-[color:var(--color-moss-deep)]"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => {
              setInviteUrl(null);
            }}
          >
            create another
          </Button>
          <Button onClick={() => router.push("/studio/clients")}>done</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
      <Field label="display name (optional)" error={errors.displayName?.message}>
        <Input {...register("displayName")} placeholder="How you'll refer to them" />
      </Field>
      <Field label="email (optional)">
        <Input type="email" {...register("email")} placeholder="name@example.com" />
      </Field>
      <Field label="phone (optional)">
        <Input {...register("phone")} placeholder="+961 70 000 000" />
      </Field>
      <Field label="private notes (optional)">
        <Textarea {...register("notes")} placeholder="Goals, injuries, anything you want to remember." />
      </Field>
      <div className="pt-2">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "generating…" : "generate invite link"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}
    </div>
  );
}
