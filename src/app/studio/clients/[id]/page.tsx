import { notFound } from "next/navigation";

import { ClientFieldToggles } from "./client-field-toggles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: client }, { data: fields }, { data: subs }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("client_profile_fields").select("*").eq("client_id", id).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("id, payment_status, sessions_remaining, start_date, end_date, package_id, packages(name, session_count)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!client) notFound();

  return (
    <div className="space-y-10 rise-in-stagger">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">client</p>
          <h1 className="mt-2 text-4xl">{client.display_name}</h1>
          <p className="mt-1 text-[color:var(--color-ink)]/70">{client.email ?? "No email on file"}</p>
        </div>
        <Badge tone={client.active ? "moss" : "stone"}>{client.active ? "active" : "paused"}</Badge>
      </header>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            {!subs || subs.length === 0 ? (
              <EmptyState title="No packages yet" body="This client hasn&rsquo;t subscribed to a package." />
            ) : (
              <ul className="divide-y divide-[color:var(--color-stone-soft)]">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">
                        {/* @ts-expect-error — nested select typings */}
                        {s.packages?.name ?? "Package"}
                      </p>
                      <p className="text-xs text-[color:var(--color-stone)] tabular-nums">
                        {s.sessions_remaining} of{" "}
                        {/* @ts-expect-error — nested select typings */}
                        {s.packages?.session_count} sessions remaining
                      </p>
                    </div>
                    <Badge tone={s.payment_status === "paid" ? "moss" : "signal"}>{s.payment_status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Log fields</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientFieldToggles
              clientId={id}
              initial={{
                weight: fields?.weight ?? true,
                cycle: fields?.cycle ?? false,
                measurements: fields?.measurements ?? false,
                progress_photos: fields?.progress_photos ?? false,
                mood: fields?.mood ?? false,
                sleep: fields?.sleep ?? false,
                prs: fields?.prs ?? false,
              }}
            />
          </CardContent>
        </Card>
      </div>

      {client.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-[color:var(--color-ink)]/85">{client.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
