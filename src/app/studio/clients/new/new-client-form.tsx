"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { createClient } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Values = {
  displayName: string;
  email: string;
  phone: string;
  notes: string;
};

export function NewClientForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors }, setError } = useForm<Values>();

  function onSubmit(values: Values) {
    startTransition(async () => {
      const result = await createClient(values);
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [k, v] of Object.entries(result.fieldErrors)) {
            setError(k as keyof Values, { message: v[0] });
          }
        } else {
          setError("displayName", { message: result.error });
        }
        return;
      }
      router.push(`/studio/clients/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
      <Field label="name" error={errors.displayName?.message}>
        <Input {...register("displayName", { required: "Required" })} placeholder="First name or full name" />
      </Field>
      <Field label="email (optional)" error={errors.email?.message}>
        <Input type="email" {...register("email")} placeholder="name@example.com" />
      </Field>
      <Field label="phone (optional)">
        <Input {...register("phone")} placeholder="+961 70 000 000" />
      </Field>
      <Field label="private notes">
        <Textarea {...register("notes")} placeholder="Goals, injuries, anything you want to remember." />
      </Field>
      <div className="pt-2">
        <Button type="submit" disabled={pending} size="lg">
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
