"use client";

import { useState } from "react";

type Plan = "monthly" | "yearly";

/**
 * Client-side selection widget for the Beta 2 plan choice on
 * `/studio/expired`. Two cards (Monthly + Yearly) toggle a `selected`
 * plan in local state; a single CTA below both cards is disabled
 * until one is picked, then opens WhatsApp with a pre-filled message
 * specific to the chosen cadence.
 *
 * Replaces the earlier "each card is its own WhatsApp link" design
 * which made the cards feel like buttons but didn't give the trainer
 * a chance to reconsider before sending — the new layout is a
 * familiar pick-then-confirm pattern.
 *
 * The exact pre-filled message strings are intentionally hard-coded
 * here rather than templated off `PRICING` so they match the copy
 * the founder confirmed verbatim:
 *
 *   Monthly: $29 / AED 109
 *   Yearly:  $290 / AED 1,090
 *
 * If pricing changes, update both this file and the canonical
 * `PRICING` map in `src/lib/pricing.ts` together.
 */
export function Beta2PlanPicker({
  firstName,
  whatsappNumber,
}: {
  firstName: string;
  whatsappNumber: string;
}) {
  const [selected, setSelected] = useState<Plan | null>(null);

  const messages: Record<Plan, string> = {
    monthly: `Hello Form Studio, I'd like to activate my monthly plan ($29 / AED 109). Thanks! — ${firstName}`,
    yearly: `Hello Form Studio, I'd like to activate my yearly plan ($290 / AED 1,090). Thanks! — ${firstName}`,
  };

  const digitsOnly = whatsappNumber.replace(/[^0-9]/g, "");
  const waHref = selected
    ? `https://wa.me/${digitsOnly}?text=${encodeURIComponent(messages[selected])}`
    : null;

  /* Shared card classes — adds a focused/selected ring when picked,
   * a quieter hover ring otherwise. `aria-pressed` lets assistive
   * tech announce the selected state. */
  const cardBase =
    "flex w-full flex-col rounded-3xl bg-[color:var(--color-canvas)] p-5 text-left transition-all focus-visible:outline-none";
  const cardIdle =
    "ring-1 ring-transparent hover:ring-[color:var(--color-stone-soft)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]/15";
  const cardSelected =
    "ring-2 ring-[color:var(--color-ink)] shadow-[0_12px_28px_-12px_rgba(31,30,27,0.35)]";

  return (
    <>
      <section className="mt-8 w-full">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          Beta 2 plans
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            aria-pressed={selected === "monthly"}
            onClick={() => setSelected("monthly")}
            className={`${cardBase} ${selected === "monthly" ? cardSelected : cardIdle}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              Monthly
            </p>
            <p className="mt-2 text-base font-semibold tracking-tight tabular-nums">
              $29/month
            </p>
            <p className="mt-0.5 text-sm text-[color:var(--color-ink)]/65 tabular-nums">
              AED 109/month
            </p>
          </button>
          <button
            type="button"
            aria-pressed={selected === "yearly"}
            onClick={() => setSelected("yearly")}
            className={`${cardBase} ${selected === "yearly" ? cardSelected : cardIdle}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              Yearly
            </p>
            <p className="mt-2 text-base font-semibold tracking-tight tabular-nums">
              $290/year
            </p>
            <p className="mt-0.5 text-sm text-[color:var(--color-ink)]/65 tabular-nums">
              AED 1,090/year
            </p>
            <p className="mt-3 text-xs italic text-[color:var(--color-ink)]/55">
              Pay 10 months instead of 12.
            </p>
          </button>
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-2">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[color:var(--color-ink)] px-7 text-[15px] font-medium text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.15),0_6px_18px_-8px_rgba(31,30,27,0.35)] transition-colors hover:bg-[color:var(--color-moss-deep)]"
          >
            WhatsApp us to activate
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex h-12 cursor-not-allowed items-center justify-center rounded-full bg-[color:var(--color-ink)]/30 px-7 text-[15px] font-medium text-[color:var(--color-canvas)]"
          >
            WhatsApp us to activate
          </button>
        )}
        {selected ? null : (
          <p className="text-center text-xs text-[color:var(--color-stone)]">
            Select a plan to continue.
          </p>
        )}
        <p className="text-center text-xs text-[color:var(--color-stone)]">
          Once paid, your account will be reactivated within a few hours.
        </p>
      </div>
    </>
  );
}
