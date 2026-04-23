import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientDashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, payment_status, sessions_remaining, start_date, end_date, packages(name)")
    .order("created_at", { ascending: false });

  const pending = subs?.find((s) => s.payment_status === "pending");

  return (
    <div className="rise-in-stagger space-y-10">
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">overview</p>
        <h1 className="mt-2 text-4xl">
          {sp.welcome ? "You&rsquo;re in." : "Welcome back."}
        </h1>
        <p className="mt-2 max-w-xl text-[color:var(--color-ink)]/75">
          {pending
            ? "Your trainer will confirm your payment soon. Once they do, you can start booking sessions."
            : "Everything you need for your training block lives here."}
        </p>
      </section>

      {subs && subs.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {subs.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle>
                  {/* @ts-expect-error — nested select typings */}
                  {s.packages?.name ?? "Your block"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[color:var(--color-ink)]/75 tabular-nums">
                  {s.sessions_remaining} sessions remaining
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-stone)]">
                  {s.payment_status === "paid" ? "active" : "awaiting payment confirmation"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No active blocks yet"
          body="Pick a package on your trainer&rsquo;s studio page to get started."
        />
      )}
    </div>
  );
}
