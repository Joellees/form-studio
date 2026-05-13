"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { archivePackage, savePackage } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Currency = "usd" | "aed" | "sar";

type FormValues = {
  name: string;
  session_count: number;
  duration_days: number;
  price_usd: number;
  /**
   * Currency the `price_usd` field is denominated in. Legacy column
   * name on the DB side; here it's just "the price in this currency".
   */
  currency: Currency;
  /**
   * Was previously named `delivery_method_mix` here — a bug that
   * silently broke `savePackage` because Zod expected
   * `session_type_mix`. Renamed to match the server-side schema, so
   * Create no longer fails with an invisible field error.
   */
  session_type_mix: "strength" | "strength_mobility";
  delivery_method: "in_person" | "online";
  payment_mode: "manual" | "online";
  cancellation_policy: "credited" | "lost";
};

type Initial = Partial<FormValues> & { id?: string; active?: boolean };

/* Currency-suffix helper for the price input placeholder. The user
 * sees "$0" / "0 AED" / "0 SAR" depending on the picker; the input's
 * default value is 0 so trainers don't have to clear a magic number
 * before typing their own. */
function pricePlaceholder(currency: Currency): string {
  if (currency === "aed") return "0 AED";
  if (currency === "sar") return "0 SAR";
  return "$0";
}

function currencyLabel(currency: Currency): string {
  if (currency === "aed") return "AED";
  if (currency === "sar") return "SAR";
  return "USD ($)";
}

export function PackageForm({ mode, initial }: { mode: "create" | "edit"; initial?: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setError,
  } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      session_count: initial?.session_count ?? 12,
      duration_days: initial?.duration_days ?? 30,
      price_usd: initial?.price_usd ?? 0,
      currency: (initial?.currency as Currency) ?? "usd",
      session_type_mix:
        (initial?.session_type_mix as FormValues["session_type_mix"]) ?? "strength",
      delivery_method:
        (initial?.delivery_method as FormValues["delivery_method"]) ?? "in_person",
      payment_mode: (initial?.payment_mode as FormValues["payment_mode"]) ?? "manual",
      cancellation_policy:
        (initial?.cancellation_policy as FormValues["cancellation_policy"]) ?? "credited",
    },
  });

  /* Watch currency so the price input's placeholder + label suffix
   * update live as the trainer picks a different currency. */
  const currency = (useWatch({ control, name: "currency" }) as Currency) ?? "usd";

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
            placeholder="12"
            {...register("session_count", { valueAsNumber: true, required: true, min: 1 })}
          />
        </Field>
        <Field label="valid for (days)" error={errors.duration_days?.message}>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="30"
            {...register("duration_days", { valueAsNumber: true, required: true, min: 1 })}
          />
        </Field>
        <Field label={`price (${currencyLabel(currency)})`} error={errors.price_usd?.message}>
          <Input
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            placeholder={pricePlaceholder(currency)}
            {...register("price_usd", { valueAsNumber: true, required: true, min: 0 })}
          />
        </Field>
      </div>

      <Field label="currency">
        <select
          {...register("currency")}
          className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
        >
          <option value="usd">USD ($)</option>
          <option value="aed">AED</option>
          <option value="sar">SAR</option>
        </select>
        <p className="mt-2 text-xs text-[color:var(--color-ink)]/70">
          The currency the price above is in. Existing packages stay in their
          original currency.
        </p>
      </Field>

      <Field label="session mix">
        <select
          {...register("session_type_mix")}
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
        <p className="mt-2 text-xs text-[color:var(--color-ink)]/70">
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
        <p className="mt-2 text-xs text-[color:var(--color-ink)]/70">
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
