import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SubLite = {
  id: string;
  start_date: string | null;
  end_date: string | null;
  sessions_remaining: number;
  payment_status: string;
  packages: { name: string } | { name: string }[] | null;
};

type ClientState =
  | { kind: "active"; package: string; endDate: string | null; sessionsLeft: number }
  | { kind: "pending"; package: string }
  | { kind: "expired"; package: string; endDate: string | null }
  | { kind: "none" };

function stateFor(subs: SubLite[]): ClientState {
  const today = new Date().toISOString().slice(0, 10);
  const nameOf = (s: SubLite) => {
    const p = Array.isArray(s.packages) ? s.packages[0] : s.packages;
    return p?.name ?? "Package";
  };
  const active = subs.find(
    (s) => s.payment_status === "paid" && (s.end_date ?? "9999-12-31") >= today && s.sessions_remaining > 0,
  );
  if (active) {
    return {
      kind: "active",
      package: nameOf(active),
      endDate: active.end_date,
      sessionsLeft: active.sessions_remaining,
    };
  }
  const pending = subs.find((s) => s.payment_status === "pending");
  if (pending) return { kind: "pending", package: nameOf(pending) };
  const expired = [...subs].sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""))[0];
  if (expired) return { kind: "expired", package: nameOf(expired), endDate: expired.end_date };
  return { kind: "none" };
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();

  const { data: clients } = await admin
    .from("clients")
    .select(
      `id, display_name, email, phone, active, created_at,
       subscriptions(id, start_date, end_date, sessions_remaining, payment_status, packages(name))`,
    )
    .eq("tenant_id", trainer.id)
    .eq("active", !showArchived)
    .order("created_at", { ascending: false });

  const rows = (clients ?? []).map((c) => ({
    ...c,
    state: stateFor((c.subscriptions ?? []) as SubLite[]),
  }));

  return (
    <div className="rise-in-stagger space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">clients</p>
          <h1 className="mt-2 text-4xl">Everyone you train.</h1>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href={showArchived ? "/studio/clients" : "/studio/clients?archived=1"}
            className="text-sm text-[color:var(--color-ink)]/60 hover:text-[color:var(--color-ink)]"
          >
            {showArchived ? "active" : "archived"}
          </Link>
          <Button asChild>
            <Link href="/studio/clients/new">invite a client</Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          bordered
          title={showArchived ? "No archived clients" : "No one yet"}
          body={
            showArchived
              ? "Archived clients will show up here."
              : "Send an invite and your first client will show up here."
          }
        />
      ) : (
        <div>
          {/* Header row */}
          <div className="grid grid-cols-[2fr_2fr_6rem_5rem_5rem] items-center gap-6 border-b border-[color:var(--color-ink)]/10 pb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            <span>name</span>
            <span>block</span>
            <span className="text-right">sessions</span>
            <span>ends</span>
            <span></span>
          </div>
          {/* Rows */}
          <ul>
            {rows.map((c) => (
              <li key={c.id} className="border-b border-[color:var(--color-ink)]/5">
                <Link
                  href={`/studio/clients/${c.id}`}
                  className="grid grid-cols-[2fr_2fr_6rem_5rem_5rem] items-center gap-6 py-4 focus-visible:outline-none focus-visible:shadow-none transition-colors hover:bg-[color:var(--color-parchment)]/50 rounded-xl px-2 -mx-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[color:var(--color-ink)]">{c.display_name}</p>
                    <p className="mt-0.5 truncate text-xs text-[color:var(--color-ink)]/55">
                      {c.email ?? c.phone ?? "—"}
                    </p>
                  </div>
                  <p className="truncate text-sm text-[color:var(--color-ink)]/80">
                    {"package" in c.state ? c.state.package : "—"}
                  </p>
                  <p className="text-right text-sm tabular-nums text-[color:var(--color-ink)]">
                    {c.state.kind === "active" ? c.state.sessionsLeft : "—"}
                  </p>
                  <p className="text-sm tabular-nums text-[color:var(--color-ink)]/60">
                    {c.state.kind === "active" || c.state.kind === "expired" ? fmtDate(c.state.endDate) : "—"}
                  </p>
                  <div className="flex justify-end">
                    <StatusPill state={c.state} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusPill({ state }: { state: ClientState }) {
  const label =
    state.kind === "active" ? "active" :
    state.kind === "pending" ? "pending" :
    state.kind === "expired" ? "expired" : "—";
  const color =
    state.kind === "active" ? "bg-[color:var(--color-moss)]" :
    state.kind === "pending" ? "bg-[color:var(--color-sienna)]" :
    "bg-[color:var(--color-stone)]";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-ink)]/70">
      <span className={cn("size-1.5 rounded-full", color)} aria-hidden />
      {label}
    </span>
  );
}
