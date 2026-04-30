"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { archivePackage, savePackage } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = {
  name: string;
  session_count: number;
  duration_days: number;
  price_usd: number;
  delivery_method_mix: "strength" | "strength_mobility";
  delivery_method: "in_person" | "online";
  payment_mode: "manual" | "online";
  cancellation_policy: "credited" | "lost";
};

type Initial = Partial<FormValues> & { id?: string; active?: boolean };

export function PackageForm({ mode, initial }: { mode: "create" | "edit"; initial?: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors }, setError } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      session_count: initial?.session_count ?? 12,
      duration_days: initial?.duration_days ?? 60,
      price_usd: initial?.price_usd ?? 1200,
      delivery_method_mix: (initial?.delivery_method_mix as FormValues["delivery_method_mix"]) ?? "strength",
      delivery_method: (initial?.delivery_method as FormValues["delivery_method"]) ?? "in_person",
      payment_mode: (initial?.payment_mode as FormValues["payment_mode"]) ?? "manual",
      cancellation_policy: (initial?.cancellation_policy as FormValues["cancellation_policy"]) ?? "credited",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await savePackage({ id: initial?.id, ...values });
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [k, v] of Object.entries(result.fieldErrors)) {
            setError(k as keyof FormValues, { message: v[0] });
          }
        } else {
          setError("name", { message: result.error });
        }
        return;
      }
      router.push("/studio/packages");
      router.refresh();
    });
  }

  function onArchive() {
    if (!initial?.id) return;
    if (!confirm("Archive this package? Existing subscriptions continue; new clients can&rsquo;t buy it.")) return;
    startTransition(async () => {
      await archivePackage(initial.id!);
      router.push("/studio/packages");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
      <Field label="name" error={errors.name?.message}>
        <Input {...register("name", { required: "Required" })} placeholder="The 12-session block" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3 sm:gap-6">
        <Field label="sessions" error={errors.session_count?.message}>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            {...register("session_count", { valueAsNumber: true, required: true, min: 1 })}
          />
        </Field>
        <Field label="valid for (days)" error={errors.duration_days?.message}>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            {...register("duration_days", { valueAsNumber: true, required: true, min: 1 })}
          />
        </Field>
        <Field label="price (usd)" error={errors.price_usd?.message}>
          <Input
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            {...register("price_usd", { valueAsNumber: true, required: true, min: 0 })}
          />
        </Field>
      </div>

      <Field label="session mix">
        <select
          {...register("delivery_method_mix")}
          className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
        >
          <option value="strength">strength</option>
          <option value="strength_mobility">strength + mobility</option>
        </select>
      </Field>

      <Field label="how sessions are delivered">
        <select
          {...register("delivery_method")}
          className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
        >
          <option value="in_person">in person</option>
          <option value="online">online (zoom)</option>
        </select>
        <p className="mt-2 text-xs text-[color:var(--color-ink)]/65">
          The default delivery for this package. You can still log a session as the
          other type per-week (e.g. one zoom while travelling). Clients can request
          additional in-app workouts anytime for $3 — those don&rsquo;t affect this
          package count.
        </p>
      </Field>

      <Field label="payment mode">
        <select
          {...register("payment_mode")}
          className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
        >
          <option value="manual">manual / cash</option>
          <option value="online">online (phase 2)</option>
        </select>
      </Field>

      <Field label="cancellation policy">
        <select
          {...register("cancellation_policy")}
          className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
        >
          <option value="credited">reschedule</option>
          <option value="lost">counted session</option>
        </select>
        <p className="mt-2 text-xs text-[color:var(--color-ink)]/65">
          Either way, clients can only cancel up until midnight the day before. Same-day
          cancellations are blocked.
        </p>
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "saving…" : mode === "create" ? "create package" : "save changes"}
        </Button>
        {mode === "edit" && initial?.active !== false ? (
          <Button type="button" variant="outline" onClick={onArchive} disabled={pending}>
            archive
          </Button>
        ) : null}
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
