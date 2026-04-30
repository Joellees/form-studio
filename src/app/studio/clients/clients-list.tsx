"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ClientRow = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  /**
   * Distilled status — drives the badge tone and "needs you" filtering.
   *  active        → paid sub, sessions remaining
   *  ending_soon   → paid sub but end_date within 7 days
   *  pending_pay   → trainer-side payment confirmation outstanding
   *  no_plan       → no active sub (expired or never had one)
   *  archived      → trainer flagged inactive
   */
  status: "active" | "ending_soon" | "pending_pay" | "no_plan" | "archived";
  packageName: string | null;
  sessionsDone: number | null;
  sessionsTotal: number | null;
  endDate: string | null;
  lastSessionAt: string | null;
};

type Sort = "recent" | "alphabetical" | "last_session" | "attention";

/**
 * Renders the trainer's client roster. All filtering/sorting happens
 * client-side because (a) the row count fits comfortably in memory and
 * (b) live search needs to feel instant. Server hands a flat list; this
 * component slices it.
 */
export function ClientsList({
  clients,
  showingArchived,
}: {
  clients: ClientRow[];
  showingArchived: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (c: ClientRow) => {
      if (q) {
        const hay = `${c.displayName} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (needsAttentionOnly) {
        if (c.status !== "pending_pay" && c.status !== "ending_soon") return false;
      }
      return true;
    };
    const out = clients.filter(matches);
    return sortClients(out, sort);
  }, [clients, query, sort, needsAttentionOnly]);

  if (clients.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[color:var(--color-stone-soft)] px-8 py-10">
        <h3 className="text-base font-semibold tracking-tight">
          {showingArchived ? "No archived clients" : "No one yet"}
        </h3>
        <p className="mt-2 max-w-lg text-sm text-[color:var(--color-ink)]/70">
          {showingArchived
            ? "Archived clients will show up here."
            : "Send an invite and your first client will show up here."}
        </p>
      </div>
    );
  }

  const attentionCount = clients.filter(
    (c) => c.status === "pending_pay" || c.status === "ending_soon",
  ).length;

  return (
    <div className="space-y-5">
      {/* Toolbar: search + sort + needs-attention filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          placeholder="search by name, email, phone"
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-[320px] flex-1"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="select-pill h-11 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
        >
          <option value="recent">recently added</option>
          <option value="alphabetical">alphabetical</option>
          <option value="last_session">last session</option>
          <option value="attention">needs attention first</option>
        </select>
        {attentionCount > 0 ? (
          <button
            type="button"
            onClick={() => setNeedsAttentionOnly((v) => !v)}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
              needsAttentionOnly
                ? "border-[color:var(--color-sienna)] bg-[color:var(--color-sienna)]/10 text-[color:var(--color-sienna)]"
                : "border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]",
            )}
          >
            <span className="size-1.5 rounded-full bg-[color:var(--color-sienna)]" aria-hidden />
            needs attention
            <span className="tabular-nums text-xs opacity-80">{attentionCount}</span>
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[color:var(--color-stone)]">
          No matches. Try clearing the search or filter.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-ink)]/5">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/studio/clients/${c.id}`}
                className="group -mx-2 grid gap-3 rounded-xl px-2 py-3.5 transition-colors hover:bg-[color:var(--color-parchment)]/50 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,7rem)_auto] sm:items-center sm:gap-6"
              >
                {/* Identity */}
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={c.displayName} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[color:var(--color-ink)]">
                      {c.displayName}
                    </p>
                    {c.email || c.phone ? (
                      <p className="mt-0.5 truncate text-xs text-[color:var(--color-ink)]/55">
                        {c.email ?? c.phone}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Package + sessions */}
                <div className="min-w-0 text-sm sm:pr-2">
                  {c.packageName ? (
                    <>
                      <p className="truncate text-[color:var(--color-ink)]/80">
                        {c.packageName}
                      </p>
                      {c.sessionsDone !== null && c.sessionsTotal !== null ? (
                        <p className="mt-0.5 text-xs tabular-nums text-[color:var(--color-stone)]">
                          {c.sessionsDone}/{c.sessionsTotal} sessions
                          {c.endDate ? ` · ends ${fmtShort(c.endDate)}` : ""}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-[color:var(--color-stone)]">no plan</p>
                  )}
                </div>

                {/* Last session */}
                <div className="text-xs tabular-nums text-[color:var(--color-stone)] sm:text-right">
                  <span className="sm:hidden">last seen </span>
                  {c.lastSessionAt ? fmtRelative(c.lastSessionAt) : "—"}
                </div>

                {/* Status badge + hover chevron */}
                <div className="flex items-center justify-end gap-2">
                  <StatusBadge status={c.status} />
                  <span
                    aria-hidden
                    className="text-[color:var(--color-stone)] opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sortClients(rows: ClientRow[], sort: Sort): ClientRow[] {
  const order = (s: ClientRow["status"]): number =>
    s === "pending_pay" ? 0 : s === "ending_soon" ? 1 : s === "active" ? 2 : s === "no_plan" ? 3 : 4;
  const copy = rows.slice();
  if (sort === "alphabetical") {
    copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } else if (sort === "last_session") {
    copy.sort((a, b) => {
      const at = a.lastSessionAt ? new Date(a.lastSessionAt).getTime() : 0;
      const bt = b.lastSessionAt ? new Date(b.lastSessionAt).getTime() : 0;
      return bt - at;
    });
  } else if (sort === "attention") {
    copy.sort(
      (a, b) =>
        order(a.status) - order(b.status) || a.displayName.localeCompare(b.displayName),
    );
  }
  // "recent" is the order the server already returned (created_at desc).
  return copy;
}

function StatusBadge({ status }: { status: ClientRow["status"] }) {
  if (status === "pending_pay") {
    return <Badge tone="signal">payment due</Badge>;
  }
  if (status === "ending_soon") {
    return <Badge tone="signal-soft">ending soon</Badge>;
  }
  if (status === "active") {
    return <Badge tone="moss">active</Badge>;
  }
  if (status === "archived") {
    return <Badge tone="stone">archived</Badge>;
  }
  return <Badge tone="stone">no plan</Badge>;
}

function Badge({
  tone,
  children,
}: {
  tone: "moss" | "signal" | "signal-soft" | "stone";
  children: React.ReactNode;
}) {
  const cls = cn(
    "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
    tone === "moss" && "bg-[color:var(--color-moss)]/10 text-[color:var(--color-moss-deep)]",
    tone === "signal" && "bg-[color:var(--color-sienna)]/12 text-[color:var(--color-sienna)]",
    tone === "signal-soft" &&
      "bg-[color:var(--color-sienna)]/8 text-[color:var(--color-sienna)]",
    tone === "stone" && "bg-[color:var(--color-stone-soft)]/40 text-[color:var(--color-ink)]/65",
  );
  return <span className={cls}>{children}</span>;
}

function Avatar({ name }: { name: string }) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-moss)]/12 text-sm font-semibold text-[color:var(--color-moss-deep)]"
      aria-hidden
    >
      {initial}
    </span>
  );
}

function fmtShort(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * "today", "yesterday", "3d ago", "Apr 14" — same friendliness as a
 * mail client's "received" column.
 */
function fmtRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const day = 86400_000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
