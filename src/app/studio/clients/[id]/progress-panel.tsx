import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type LogEntry = {
  id: string;
  field_type: string;
  value: unknown;
  notes: string | null;
  logged_at: string;
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function latestOf(logs: LogEntry[], type: string): LogEntry | undefined {
  return logs.find((l) => l.field_type === type);
}

function extract(v: unknown, key: string): string | number | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const raw = obj[key];
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

function average(logs: LogEntry[], type: string, key: string, limit = 7): number | null {
  const scores = logs
    .filter((l) => l.field_type === type)
    .slice(0, limit)
    .map((l) => extract(l.value, key))
    .filter((v): v is number => typeof v === "number");
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Snapshot of how the client&rsquo;s been showing up — last weight, 7-day
 * averages for mood + sleep, and a few recent notes. Skip anything the
 * trainer hasn&rsquo;t enabled for this client.
 */
export function ProgressPanel({
  logs,
  enabled,
}: {
  logs: LogEntry[];
  enabled: { weight: boolean; mood: boolean; sleep: boolean; measurements: boolean; prs: boolean };
}) {
  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[color:var(--color-ink)]/70">
            Nothing logged yet. What you toggle on in &lsquo;log fields&rsquo; is what your client will
            see in their dashboard.
          </p>
        </CardContent>
      </Card>
    );
  }

  const latestWeight = latestOf(logs, "weight");
  const weightKg = latestWeight ? extract(latestWeight.value, "kg") : null;
  const moodAvg = average(logs, "mood", "score");
  const sleepAvg = average(logs, "sleep", "score");
  const recentPrs = logs.filter((l) => l.field_type === "pr").slice(0, 3);
  const recentMeasurements = logs.filter((l) => l.field_type === "measurements").slice(0, 1)[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Headline stats */}
        <div className="grid gap-3 md:grid-cols-3">
          {enabled.weight && weightKg != null ? (
            <Stat
              label="weight"
              value={`${weightKg} kg`}
              hint={latestWeight ? `logged ${fmtDate(latestWeight.logged_at)}` : undefined}
            />
          ) : null}
          {enabled.mood && moodAvg != null ? (
            <Stat label="mood · 7-day avg" value={moodAvg.toFixed(1)} hint="out of 5" />
          ) : null}
          {enabled.sleep && sleepAvg != null ? (
            <Stat label="sleep · 7-day avg" value={sleepAvg.toFixed(1)} hint="out of 5" />
          ) : null}
        </div>

        {/* Recent personal records */}
        {enabled.prs && recentPrs.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              recent prs
            </p>
            <ul className="mt-2 divide-y divide-[color:var(--color-stone-soft)]/50">
              {recentPrs.map((pr) => (
                <li key={pr.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{extract(pr.value, "exercise") ?? "Exercise"}</span>
                  <span className="tabular-nums text-[color:var(--color-ink)]/80">
                    {extract(pr.value, "kg")} kg ·{" "}
                    <span className="text-[color:var(--color-stone)]">{fmtDate(pr.logged_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Latest measurements */}
        {enabled.measurements && recentMeasurements ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              latest measurements · {fmtDate(recentMeasurements.logged_at)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
              {Object.entries((recentMeasurements.value ?? {}) as Record<string, unknown>)
                .filter(([, v]) => typeof v === "number")
                .map(([k, v]) => (
                  <span key={k} className="text-[color:var(--color-ink)]/80">
                    <span className="text-[color:var(--color-stone)]">
                      {k.replace(/_cm$/, "")}
                    </span>{" "}
                    {String(v)} cm
                  </span>
                ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-[color:var(--color-parchment)]/60 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[color:var(--color-stone)]">{hint}</p> : null}
    </div>
  );
}
