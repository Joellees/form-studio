import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTrainerTable, type TrainerRow } from "./_components/trainer-table";
import { Wordmark } from "@/components/brand/wordmark";
import { cohortLabel, KNOWN_COHORT_KEYS } from "@/lib/cohorts";
import { isSuperAdmin } from "@/lib/env";
import { formatPrice, getPrice, isPricedCohort } from "@/lib/pricing";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SubRow = {
  studio_id: string;
  cohort: string | null;
  status: string | null;
  cadence: string | null;
  currency: string | null;
  paid_until: string | null;
  last_marked_paid_at: string | null;
};

/**
 * Admin dashboard — operator console for the pre-Stripe phase.
 * Non-admins get a 404 (route deliberately not advertised). The
 * studio subscription gate doesn't apply to /admin: operator
 * actions have to keep working even if the admin's own
 * subscription would otherwise be blocked.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    cohort?: string;
    status?: string;
    cadence?: string;
    currency?: string;
    expiring?: string;
    show_deleted?: string;
    q?: string;
  }>;
}) {
  const { userId } = await auth();
  if (!userId || !isSuperAdmin(userId)) notFound();

  const sp = await searchParams;
  const supabase = createSupabaseAdminClient();

  /* Wide select includes `trial_started_at` (migration 0014). Fall
   * back to the legacy column list on PostgREST 42703 / PGRST204 so
   * the admin page stays alive even before the migration is applied
   * — trial column just renders as not-set everywhere. */
  const trainersWide = await supabase
    .from("trainers")
    .select(
      "id, display_name, email, clerk_id, subdomain_slug, cohort, subscription_status, paid_until, soft_deleted_at, created_at, trial_started_at",
    )
    .order("created_at", { ascending: false });
  const trainers =
    trainersWide.error &&
    (trainersWide.error.code === "42703" || trainersWide.error.code === "PGRST204")
      ? (
          await supabase
            .from("trainers")
            .select(
              "id, display_name, email, clerk_id, subdomain_slug, cohort, subscription_status, paid_until, soft_deleted_at, created_at",
            )
            .order("created_at", { ascending: false })
        ).data
      : trainersWide.data;

  const { data: subs } = (await supabase
    .from("trainer_subscriptions")
    .select(
      "studio_id, cohort, status, cadence, currency, paid_until, last_marked_paid_at",
    )) as { data: SubRow[] | null };

  const subByStudio = new Map<string, SubRow>();
  for (const s of subs ?? []) subByStudio.set(s.studio_id, s);

  const showDeleted = sp.show_deleted === "1";
  const visibleTrainers = (trainers ?? []).filter(
    (t) => showDeleted || !t.soft_deleted_at,
  );

  const today = Date.now();
  const stats = {
    total: visibleTrainers.length,
    founding: visibleTrainers.filter((t) => t.subscription_status === "founding").length,
    active: visibleTrainers.filter((t) => t.subscription_status === "active").length,
    expired: visibleTrainers.filter((t) => {
      const sub = subByStudio.get(t.id as string);
      return t.subscription_status === "expired" && !!sub?.last_marked_paid_at;
    }).length,
    awaitingFirst: visibleTrainers.filter((t) => {
      const sub = subByStudio.get(t.id as string);
      return t.subscription_status === "expired" && !sub?.last_marked_paid_at;
    }).length,
    expiringWeek: visibleTrainers.filter((t) => {
      if (t.subscription_status !== "active" || !t.paid_until) return false;
      const ms = new Date(t.paid_until as string).getTime() - today;
      return ms > 0 && ms < 7 * 86400_000;
    }).length,
  };

  const rows: TrainerRow[] = visibleTrainers
    .filter((t) => {
      if (sp.cohort && sp.cohort !== "all") {
        if ((t.cohort ?? "") !== sp.cohort) return false;
      }
      if (sp.status && sp.status !== "all") {
        if ((t.subscription_status ?? "") !== sp.status) return false;
      }
      const sub = subByStudio.get(t.id as string);
      if (sp.cadence && sp.cadence !== "all" && sub?.cadence !== sp.cadence) return false;
      if (sp.currency && sp.currency !== "all" && sub?.currency !== sp.currency) return false;
      if (sp.expiring && sp.expiring !== "any" && t.paid_until) {
        const days = Number(sp.expiring);
        const ms = new Date(t.paid_until as string).getTime() - today;
        if (!(ms > 0 && ms < days * 86400_000)) return false;
      }
      if (sp.q) {
        const hay = `${t.display_name ?? ""} ${t.email ?? ""}`.toLowerCase();
        if (!hay.includes(sp.q.toLowerCase())) return false;
      }
      return true;
    })
    .map((t) => {
      const sub = subByStudio.get(t.id as string);
      const cadence = sub?.cadence ?? null;
      const currency = sub?.currency ?? null;
      const amount =
        cadence && currency && t.cohort && isPricedCohort(t.cohort)
          ? getPrice(
              t.cohort as Parameters<typeof getPrice>[0],
              cadence as "monthly" | "annual",
              currency as "usd" | "aed" | "sar",
            )
          : null;
      return {
        id: t.id as string,
        displayName: (t.display_name as string) ?? "",
        email: (t.email as string) ?? null,
        subdomainSlug: (t.subdomain_slug as string) ?? null,
        cohort: (t.cohort as string) ?? null,
        cohortDisplay: cohortLabel((t.cohort as string) ?? null),
        status: (t.subscription_status as string) ?? null,
        cadence,
        currency,
        priceDisplay:
          amount !== null && currency ? formatPrice(amount, currency) : null,
        paidUntil: (t.paid_until as string) ?? null,
        lastMarkedPaidAt: sub?.last_marked_paid_at ?? null,
        joinedAt: (t.created_at as string) ?? null,
        trialStartedAt:
          ((t as { trial_started_at?: string | null }).trial_started_at) ?? null,
        softDeleted: !!t.soft_deleted_at,
      };
    });

  return (
    <main className="mx-auto max-w-[1280px] px-5 py-8 md:px-8 md:py-12">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Wordmark variant="inline-platform" />
          <span className="rounded-full bg-[color:var(--color-moss)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss-deep)]">
            admin
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/admin/codes"
            className="rounded-full border border-[color:var(--color-ink)]/15 bg-[color:var(--color-canvas)] px-4 py-2 hover:bg-[color:var(--color-parchment)]"
          >
            access codes
          </Link>
        </div>
      </div>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="trainers" value={stats.total} />
        <StatCard label="founding" value={stats.founding} />
        <StatCard label="active paying" value={stats.active} />
        <StatCard label="expired" value={stats.expired} />
        <StatCard label="awaiting first" value={stats.awaitingFirst} tone="signal" />
        <StatCard label="expiring 7d" value={stats.expiringWeek} tone="signal" />
      </section>

      <FilterBar
        cohorts={KNOWN_COHORT_KEYS}
        applied={{
          cohort: sp.cohort ?? "all",
          status: sp.status ?? "all",
          cadence: sp.cadence ?? "all",
          currency: sp.currency ?? "all",
          expiring: sp.expiring ?? "any",
          show_deleted: showDeleted,
          q: sp.q ?? "",
        }}
      />

      <AdminTrainerTable rows={rows} />
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "signal";
}) {
  return (
    <div className="rounded-2xl bg-[color:var(--color-parchment)]/55 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl tabular-nums ${
          tone === "signal" ? "text-[color:var(--color-sienna)]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FilterBar({
  cohorts,
  applied,
}: {
  cohorts: readonly string[];
  applied: {
    cohort: string;
    status: string;
    cadence: string;
    currency: string;
    expiring: string;
    show_deleted: boolean;
    q: string;
  };
}) {
  return (
    <form
      method="get"
      action="/admin"
      className="mt-8 flex flex-wrap items-end gap-2 rounded-2xl bg-[color:var(--color-parchment)]/40 p-3"
    >
      <SelectField name="cohort" label="cohort" value={applied.cohort}>
        <option value="all">all</option>
        {cohorts.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>
      <SelectField name="status" label="status" value={applied.status}>
        <option value="all">all</option>
        <option value="founding">founding</option>
        <option value="active">active</option>
        <option value="expired">expired</option>
        <option value="canceled">canceled</option>
      </SelectField>
      <SelectField name="cadence" label="cadence" value={applied.cadence}>
        <option value="all">all</option>
        <option value="monthly">monthly</option>
        <option value="annual">annual</option>
      </SelectField>
      <SelectField name="currency" label="currency" value={applied.currency}>
        <option value="all">all</option>
        <option value="usd">USD</option>
        <option value="aed">AED</option>
        <option value="sar">SAR</option>
      </SelectField>
      <SelectField name="expiring" label="expiring within" value={applied.expiring}>
        <option value="any">any</option>
        <option value="3">3 days</option>
        <option value="7">7 days</option>
        <option value="14">14 days</option>
        <option value="30">30 days</option>
      </SelectField>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          search
        </span>
        <input
          type="text"
          name="q"
          defaultValue={applied.q}
          placeholder="name or email"
          className="h-9 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 self-end pb-1.5 text-xs">
        <input
          type="checkbox"
          name="show_deleted"
          value="1"
          defaultChecked={applied.show_deleted}
        />
        show soft-deleted
      </label>
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
      >
        apply
      </button>
    </form>
  );
}

function SelectField({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="select-pill h-9 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
      >
        {children}
      </select>
    </div>
  );
}
