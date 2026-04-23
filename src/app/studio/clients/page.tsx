import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

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
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
        <div className="flex items-center gap-3">
          <Link
            href={showArchived ? "/studio/clients" : "/studio/clients?archived=1"}
            className="text-sm text-[color:var(--color-ink)]/70 underline underline-offset-4 hover:text-[color:var(--color-ink)]"
          >
            {showArchived ? "show active" : "show archived"}
          </Link>
          <Button asChild>
            <Link href="/studio/clients/new">invite a client</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title={showArchived ? "No archived clients" : "No one yet"}
                body={showArchived ? "Archived clients will show up here." : "Send an invite and your first client will show up here."}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>name</TableHead>
                  <TableHead>block</TableHead>
                  <TableHead className="text-right">sessions left</TableHead>
                  <TableHead>ends</TableHead>
                  <TableHead>status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-[color:var(--color-parchment)]/60"
                    onClick={undefined}
                  >
                    <TableCell>
                      <Link href={`/studio/clients/${c.id}`} className="block">
                        <span className="font-medium">{c.display_name}</span>
                        <span className="block text-xs text-[color:var(--color-stone)]">
                          {c.email ?? c.phone ?? "—"}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/studio/clients/${c.id}`} className="block text-[color:var(--color-ink)]/80">
                        {c.state.kind === "none" ? "—" :
                          "package" in c.state ? c.state.package : "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link href={`/studio/clients/${c.id}`} className="block">
                        {c.state.kind === "active" ? c.state.sessionsLeft : "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-[color:var(--color-ink)]/70">
                      <Link href={`/studio/clients/${c.id}`} className="block">
                        {c.state.kind === "active" || c.state.kind === "expired"
                          ? fmtDate(c.state.endDate)
                          : "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/studio/clients/${c.id}`} className="block">
                        <StateBadge state={c.state} />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StateBadge({ state }: { state: ClientState }) {
  switch (state.kind) {
    case "active":
      return <Badge tone="moss">active</Badge>;
    case "pending":
      return <Badge tone="signal">awaiting payment</Badge>;
    case "expired":
      return <Badge tone="stone">expired</Badge>;
    case "none":
      return <Badge tone="stone">no block</Badge>;
  }
}
