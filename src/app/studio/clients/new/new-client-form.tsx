"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { claimClientByCode, lookupClientCode } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Values = {
  code: string;
  displayName: string;
  phone: string;
  notes: string;
};

type Lookup = { email: string | null; displayName: string | null };

export function NewClientForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors }, setError, setValue, getValues } = useForm<Values>();

  async function onBlurCode() {
    const code = (getValues("code") ?? "").trim().toUpperCase();
    setLookupError(null);
    setLookup(null);
    if (code.length !== 6) return;
    const result = await lookupClientCode(code);
    if (!result.ok) {
      setLookupError(result.error);
      return;
    }
    setLookup(result.data);
    if (result.data.displayName && !getValues("displayName")) {
      setValue("displayName", result.data.displayName);
    }
  }

  function onSubmit(values: Values) {
    startTransition(async () => {
      const result = await claimClientByCode({
        code: values.code.trim().toUpperCase(),
        displayName: values.displayName,
        phone: values.phone,
        notes: values.notes,
      });
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [k, v] of Object.entries(result.fieldErrors)) {
            setError(k as keyof Values, { message: v[0] });
          }
        } else {
          setError("code", { message: result.error });
        }
        return;
      }
      router.push(`/studio/clients/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
      <Field label="client code" error={errors.code?.message ?? lookupError ?? undefined}>
        <Input
          {...register("code", { required: "Ask your client for their 6-letter code" })}
          onBlur={onBlurCode}
          placeholder="AB3X9Z"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase tracking-[0.3em]"
          maxLength={6}
        />
        {lookup ? (
          <p className="mt-1 text-xs text-[color:var(--color-moss-deep)]">
            linked to {lookup.email ?? "(no email on file)"}
          </p>
        ) : (
          <p className="mt-1 text-xs text-[color:var(--color-stone)]">
            Your client creates their account at <span className="font-mono">/join</span> and shares this code with you.
          </p>
        )}
      </Field>

      <Field label="display name" error={errors.displayName?.message}>
        <Input
          {...register("displayName", { required: "Required" })}
          placeholder="How you'll refer to them"
        />
      </Field>

      <Field label="phone (optional)">
        <Input {...register("phone")} placeholder="+961 70 000 000" />
      </Field>

      <Field label="private notes">
        <Textarea {...register("notes")} placeholder="Goals, injuries, anything you want to remember." />
      </Field>

      <div className="pt-2">
        <Button type="submit" disabled={pending || !lookup} size="lg">
          {pending ? "adding…" : "add client"}
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
