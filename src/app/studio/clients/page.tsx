import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, display_name, email, active, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="rise-in-stagger space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">clients</p>
          <h1 className="mt-2 font-display text-4xl">Everyone you train.</h1>
        </div>
        <Button asChild>
          <Link href="/studio/clients/new">invite a client</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {!clients || clients.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No one yet"
                body="Send an invite and your first client will show up here."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>name</TableHead>
                  <TableHead>email</TableHead>
                  <TableHead>status</TableHead>
                  <TableHead className="text-right">joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/studio/clients/${c.id}`} className="hover:text-[color:var(--color-moss-deep)]">
                        {c.display_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[color:var(--color-ink)]/70">{c.email}</TableCell>
                    <TableCell>{c.active ? "active" : "paused"}</TableCell>
                    <TableCell className="text-right tabular-nums text-[color:var(--color-ink)]/70">
                      {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
