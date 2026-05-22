"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { archivePackage, savePackage } from "../actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Currency = "usd" | "aed" | "sar";

type FormValues = {
  name: string;
  /**
   * Optional client-facing summary shown on the public storefront
   * under each package. Replaced the `session_type_mix` badge after
   * trainer feedback that "strength" / "strength + mobility" wasn't
   * carrying enough information for prospective clients.
   */
  description: string;
  session_count: number;
  duration_days: number;
  price_usd: number;
  /**
   * Currency the `price_usd` field is denominated in. Legacy column
   * name on the DB side; here it's just "the price in this currency".
   */
  currency: Currency;
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
  return "USD";
}

export function PackageForm({ mode, initial }: { mode: "create" | "edit"; initial?: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setError,
  } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      session_count: initial?.session_count ?? 12,
      duration_days: initial?.duration_days ?? 30,
      price_usd: initial?.price_usd ?? 0,
      currency: (initial?.currency as Currency) ?? "usd",
      delivery_method:
        (initial?.delivery_method as FormValues["delivery_method"]) ?? "in_person",
      payment_mode: (initial?.payment_mode as FormValues["payment_mode"]) ?? "manual",
      cancellation_policy:
        (initial?.cancellation_policy as FormValues["cancellation_policy"]) ?? "credited",
    },
  });

  /* Description is collapsed by default (per trainer feedback that
   * the textarea was taking up too much room for a field most
   * trainers don't fill in). The disclosure opens it only when the
   * trainer explicitly wants to write a public-facing summary. On
   * edit-mode for an existing package WITH a description, start
   * expanded so the trainer sees what's there. */
  const [descOpen, setDescOpen] = useState<boolean>(
    Boolean(initial?.description && initial.description.length > 0),
  );

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

  async function onArchive() {
    if (!initial?.id) return;
    const ok = await confirm({
      title: "archive this package?",
      body: "existing subscriptions continue. new clients can't buy it until you restore it.",
      confirmLabel: "archive",
      tone: "danger",
    });
    if (!ok) return;
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

      {/* Description is opt-in. Most packages don't need one. */}
      {descOpen ? (
        <Field label="description" error={errors.description?.message}>
          <Textarea
            rows={3}
            {...register("description", { maxLength: { value: 600, message: "Keep it under 600 characters." } })}
            placeholder="What's in this package — written for the client."
            autoFocus
          />
          <button
            type="button"
            onClick={() => setDescOpen(false)}
            className="mt-1 self-start text-xs text-[color:var(--color-stone)] underline underline-offset-4 hover:text-[color:var(--color-ink)]"
          >
            hide description
          </button>
        </Field>
      ) : (
        <button
          type="button"
          onClick={() => setDescOpen(true)}
          className="self-start text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
        >
          + add description
        </button>
      )}

      {/* sessions · time · price+currency on one balanced row. The
        * old layout had three equal-width columns that left blank
        * space next to the small numbers and crammed the price +
        * currency dropdown together. Bumping the price column wider
        * gives the composite price+currency control breathing room
        * without making the count fields feel oversized. */}
      <div className="grid gap-5 sm:grid-cols-[1fr_1fr_1.4fr] sm:gap-4">
        <Field label="sessions" error={errors.session_count?.message}>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="12"
            {...register("session_count", { valueAsNumber: true, required: true, min: 1 })}
          />
        </Field>
        <Field label="timeframe (days)" error={errors.duration_days?.message}>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="30"
            {...register("duration_days", { valueAsNumber: true, required: true, min: 1 })}
          />
        </Field>
        <Field label="price" error={errors.price_usd?.message}>
          {/* Currency lives inline on the price field — keeps the
            * row compact and ties the dropdown to the value it's
            * labelling. Both controls share h-11 + rounded-full so
            * they read as a single composite field. */}
          <div className="flex items-stretch gap-2">
            <Input
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              placeholder={pricePlaceholder(currency)}
              {...register("price_usd", { valueAsNumber: true, required: true, min: 0 })}
              className="flex-1"
            />
            <select
              {...register("currency")}
              aria-label="currency"
              className="select-pill h-11 shrink-0 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
            >
              <option value="usd">{currencyLabel("usd")}</option>
              <option value="aed">{currencyLabel("aed")}</option>
              <option value="sar">{currencyLabel("sar")}</option>
            </select>
          </div>
        </Field>
      </div>

      {/* Delivery — one-line description. The "online" option used
        * to say "online (zoom)" + a paragraph explaining package
        * flexibility + the $3 in-app add-on; trainers said it was
        * too much. Single-line copy from here on. */}
      <Field label="how sessions are delivered">
        <select
          {...register("delivery_method")}
          className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
        >
          <option value="in_person">in person</option>
          <option value="online">online</option>
        </select>
        <p className="mt-2 text-xs text-[color:var(--color-ink)]/65">
          default delivery — switchable per session.
        </p>
      </Field>

      {/* Payment + cancellation share one row. Payment is locked to
        * cash for now (the "online (phase 2)" option is intentionally
        * hidden until we wire the gateway — surfacing it pre-build
        * leaks a setting the trainer can pick but we can't honour).
        * Cancellation policy sits beside it with the shared
        * "midnight cutoff" copy underneath both. */}
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        <Field label="payment">
          <select
            {...register("payment_mode")}
            className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
          >
            {/* Only the cash option is rendered. Once the gateway is
              * live, swap this to a list including "online". */}
            <option value="manual">cash</option>
          </select>
        </Field>
        <Field label="cancellation">
          <select
            {...register("cancellation_policy")}
            className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
          >
            <option value="credited">reschedule</option>
            <option value="lost">counted session</option>
          </select>
        </Field>
      </div>
      <p className="-mt-3 text-xs text-[color:var(--color-ink)]/65">
        clients can cancel until midnight the day before. same-day cancellations are blocked.
      </p>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "saving…" : mode === "create" ? "create package" : "save changes"}
        </Button>
        {mode === "edit" && initial?.active !== false ? (
          <Button type="button" variant="outline" onClick={() => void onArchive()} disabled={pending}>
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
