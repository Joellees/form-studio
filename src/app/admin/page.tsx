import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isSuperAdmin } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId || !isSuperAdmin(userId)) redirect("/");

  const admin = createSupabaseAdminClient();
  const { data: trainers } = await admin
    .from("trainers")
    .select("id, display_name, subdomain_slug, email, subscription_tier, subscription_status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-[1180px] px-6 py-10 rise-in">
      <div className="flex items-center justify-between">
        <Wordmark variant="inline-platform" />
        <span className="rounded-full bg-[color:var(--color-moss)]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--color-moss-deep)]">
          super admin
        </span>
      </div>

      <section className="mt-16">
        <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">trainers</p>
        <h1 className="mt-2 text-4xl">Every studio on the platform.</h1>
      </section>

      <Card className="mt-10">
        <CardHeader>
          <CardTitle>All trainers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>name</TableHead>
                <TableHead>subdomain</TableHead>
                <TableHead>email</TableHead>
                <TableHead>tier</TableHead>
                <TableHead>status</TableHead>
                <TableHead className="text-right">joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(trainers ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.display_name}</TableCell>
                  <TableCell className="text-[color:var(--color-moss-deep)]">{t.subdomain_slug}</TableCell>
                  <TableCell className="text-[color:var(--color-ink)]/70">{t.email}</TableCell>
                  <TableCell className="capitalize">{t.subscription_tier}</TableCell>
                  <TableCell className="capitalize">{t.subscription_status}</TableCell>
                  <TableCell className="text-right tabular-nums text-[color:var(--color-ink)]/70">
                    {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
