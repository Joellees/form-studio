import { LogEntryForm } from "./log-entry-form";
import { LogList } from "./log-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientLogsPage() {
  const supabase = await createSupabaseServerClient();
  const [, { data: fields }, { data: logs }] = await Promise.all([
    supabase.from("clients").select("id").maybeSingle(),
    supabase.from("client_profile_fields").select("*").maybeSingle(),
    supabase
      .from("client_logs")
      .select("id, field_type, value, notes, logged_at")
      .order("logged_at", { ascending: false })
      .limit(50),
  ]);

  const enabled = {
    weight: fields?.weight ?? false,
    cycle: fields?.cycle ?? false,
    measurements: fields?.measurements ?? false,
    mood: fields?.mood ?? false,
    sleep: fields?.sleep ?? false,
    prs: fields?.prs ?? false,
    progress_photos: fields?.progress_photos ?? false,
  };

  const anyEnabled = Object.values(enabled).some(Boolean);

  return (
    <div className="rise-in-stagger space-y-10">
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">logs</p>
        <h1 className="mt-2 font-display text-4xl">What you&rsquo;re tracking.</h1>
      </section>

      {!anyEnabled ? (
        <EmptyState
          title="Nothing to log yet"
          body="Your trainer decides which fields show up here. If something&rsquo;s missing, message them."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Log an entry</CardTitle>
            </CardHeader>
            <CardContent>
              <LogEntryForm enabled={enabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <LogList logs={logs ?? []} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
