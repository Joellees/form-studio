import Link from "next/link";

export type RailSession = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  clientName: string;
  sessionType: "in_person" | "zoom" | "in_app";
  status: "scheduled" | "completed" | "cancelled" | "requested" | "declined";
  timeLabel: string;
  dayLabel: string | null; // "today" | "tomorrow" | "Mon, May 4" — controls section break
};

/**
 * Right-rail list of what's coming up. Groups rows by day with a
 * short eyebrow header so the trainer can scan tomorrow at a glance
 * without reading every timestamp.
 */
export function TodayRail({ sessions }: { sessions: RailSession[] }) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl bg-[color:var(--color-parchment)]/55 p-5">
        <p className="text-sm text-[color:var(--color-ink)]/75">
          Nothing scheduled in the next 7 days. Drop a session in to get going.
        </p>
        <Link
          href="/studio/calendar"
          className="mt-3 inline-flex h-8 items-center rounded-full bg-[color:var(--color-ink)] px-3.5 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
        >
          open calendar
        </Link>
      </div>
    );
  }

  // Group by dayLabel. Using a label string is cheap and stable since
  // the parent already pre-formatted in the trainer's tz.
  const groups: { day: string; rows: RailSession[] }[] = [];
  for (const s of sessions) {
    const day = s.dayLabel ?? "later";
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(s);
    else groups.push({ day, rows: [s] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.day}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            {g.day}
          </p>
          <ul className="mt-2 space-y-1.5">
            {g.rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/studio/sessions/${s.id}`}
                  className="flex items-center gap-3 rounded-xl bg-[color:var(--color-parchment)]/55 px-3 py-2.5 transition-colors hover:bg-[color:var(--color-parchment)]"
                >
                  <span className="text-xs tabular-nums text-[color:var(--color-stone)] min-w-[44px]">
                    {s.timeLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {s.clientName}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
                    {prettyType(s.sessionType)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function prettyType(t: RailSession["sessionType"]): string {
  if (t === "in_person") return "in person";
  if (t === "in_app") return "in-app";
  return "online";
}
