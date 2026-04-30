import { notFound, redirect } from "next/navigation";

import { SessionBuilder } from "@/app/studio/sessions/[id]/session-builder";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatInTz } from "@/lib/schedule";
import { requireClient } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function ClientSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let client;
  try {
    client = await requireClient();
  } catch (err) {
    if (err instanceof Error && err.message === "PICK_STUDIO") redirect("/client/pick");
    throw err;
  }
  const admin = createSupabaseAdminClient();

  const [{ data: me }, { data: session }, { data: blocksRaw }] = await Promise.all([
    admin.from("clients").select("timezone, trainers(timezone)").eq("id", client.id).maybeSingle(),
    admin
      .from("sessions")
      .select("id, scheduled_at, duration_minutes, session_type, status, name, notes, zoom_url")
      .eq("id", id)
      .eq("client_id", client.id)
      .maybeSingle(),
    admin
      .from("session_blocks")
      .select(
        `id, order_index,
         session_block_exercises(id, order_index, setup_override,
           exercises(id, name, default_descriptor, video_url),
           session_set_groups(id, order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds, performed_sets, performed_reps, performed_weight, performed_notes)
         )`,
      )
      .eq("session_id", id)
      .order("order_index"),
  ]);

  if (!session) notFound();

  const trainersRel = me?.trainers as { timezone?: string } | { timezone?: string }[] | null;
  const trainer = Array.isArray(trainersRel) ? trainersRel[0] ?? null : trainersRel;
  const tz = me?.timezone ?? trainer?.timezone ?? "UTC";

  const blocks = (blocksRaw ?? []).map((b) => {
    const bes = (b.session_block_exercises ?? []) as Array<{
      id: string;
      order_index: number;
      setup_override: string | null;
      exercises: Array<Record<string, unknown>> | Record<string, unknown> | null;
      session_set_groups: Array<Record<string, unknown>>;
    }>;
    return {
      ...b,
      session_block_exercises: bes.map((be) => ({
        ...be,
        exercises: Array.isArray(be.exercises) ? be.exercises[0] ?? null : be.exercises,
      })),
    };
  });

  return (
    <div className="rise-in-stagger space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">session</p>
          <h1 className="mt-2 text-3xl md:text-4xl">{session.name ?? prettySessionType(session.session_type)}</h1>
          <p className="mt-1 text-sm text-[color:var(--color-stone)] tabular-nums">
            {formatInTz(new Date(session.scheduled_at), tz, "EEE, MMM d, yyyy · HH:mm")} · {session.duration_minutes} min
          </p>
        </div>
        <Badge tone={session.status === "completed" ? "moss" : "stone"}>{session.status}</Badge>
      </header>

      {session.session_type === "zoom" && session.zoom_url ? (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm">Join when it&rsquo;s time.</p>
            <a
              href={session.zoom_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-full bg-[color:var(--color-ink)] px-5 text-sm font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
            >
              join call
            </a>
          </CardContent>
        </Card>
      ) : null}

      {session.session_type === "in_app" ? (
        // In-app session: client sees the full workout — videos, reps,
        // sets, and the performed-log inputs. This is the paid tier.
        <SessionBuilder
          sessionId={session.id}
          sessionNotes={session.notes}
          canEdit={false}
          blocks={blocks as unknown as Parameters<typeof SessionBuilder>[0]["blocks"]}
          library={[]}
        />
      ) : (
        // In-person or online-call session: the trainer coaches in the room or
        // on the call. Client sees only the list of exercise names as
        // a teaser — the plan, the loads, and the videos stay with the
        // trainer so the client doesn&rsquo;t short-circuit the coaching.
        <ExerciseTeaser blocks={blocks as unknown as Parameters<typeof ExerciseTeaser>[0]["blocks"]} />
      )}
    </div>
  );
}

/**
 * Client-side teaser for in-person and online-call sessions. Shows
 * exercise names + the trainer&rsquo;s prescribed sets (sets × reps ×
 * weight, rest) but deliberately NO video links and NO instructional
 * URLs. Those live behind the in-app upgrade.
 */
function ExerciseTeaser({
  blocks,
}: {
  blocks: Array<{
    round_count?: number;
    round_label?: string | null;
    session_block_exercises: Array<{
      exercises: { name: string } | { name: string }[] | null;
      session_set_groups?: Array<{
        order_index: number;
        label: string | null;
        sets: number;
        rep_type: string;
        rep_value: unknown;
        weight_type: string;
        weight_value: unknown;
        rest_seconds: number | null;
      }>;
    }>;
  }>;
}) {
  const items = blocks.flatMap((b) =>
    (b.session_block_exercises ?? []).map((be) => {
      const ex = Array.isArray(be.exercises) ? be.exercises[0] : be.exercises;
      const setGroups = (be.session_set_groups ?? [])
        .slice()
        .sort((a, z) => a.order_index - z.order_index);
      return { name: ex?.name ?? null, setGroups, roundLabel: b.round_label ?? null };
    }),
  );
  const visible = items.filter((it) => it.name);

  if (visible.length === 0) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-[color:var(--color-ink)]/70">
          Your trainer will walk you through everything when you meet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          today&rsquo;s plan
        </p>
        <ul className="mt-4 space-y-4">
          {visible.map((it, i) => (
            <li key={i} className="rounded-2xl bg-[color:var(--color-parchment)]/60 p-4">
              <div className="flex items-baseline gap-3">
                <span className="text-[11px] font-medium tabular-nums text-[color:var(--color-stone)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-semibold tracking-tight text-[color:var(--color-ink)]">
                  {it.name}
                </span>
              </div>
              {it.setGroups.length > 0 ? (
                <ul className="mt-3 space-y-1.5 pl-7 text-sm tabular-nums text-[color:var(--color-ink)]/85">
                  {it.setGroups.map((sg) => (
                    <li key={sg.order_index} className="flex items-baseline gap-2">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-stone)]">
                        {sg.label ?? `set ${sg.order_index + 1}`}
                      </span>
                      <span>
                        {sg.sets} × {formatRep(sg.rep_type, sg.rep_value)}
                        {formatWeightSuffix(sg.weight_type, sg.weight_value)}
                      </span>
                      {sg.rest_seconds ? (
                        <span className="text-[color:var(--color-stone)]">
                          · rest {sg.rest_seconds}s
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-[color:var(--color-stone)]">
          Cues + technique pointers come from your trainer in the session. For the
          full workout view with videos and step-by-step, request an in-app upgrade.
        </p>
      </CardContent>
    </Card>
  );
}

function formatRep(type: string, raw: unknown): string {
  const v = raw as Record<string, unknown> | null;
  if (!v) return "";
  if (type === "fixed") return `${v.reps ?? ""}`;
  if (type === "range") return `${v.min ?? ""}–${v.max ?? ""}`;
  if (type === "time") return `${v.seconds ?? ""}s`;
  if (type === "hold") return `hold ${v.seconds ?? ""}s`;
  if (type === "unilateral") return `${v.per_side ?? ""}/side`;
  if (type === "amrap") return "amrap";
  if (type === "single") return "1";
  return String(type);
}

function formatWeightSuffix(type: string, raw: unknown): string {
  const v = raw as Record<string, unknown> | null;
  if (!v) return "";
  if (type === "load" && v.kg) return ` · ${v.kg}kg`;
  if (type === "bw") return " · bw";
  if (type === "percentage" && v.percent) return ` · ${v.percent}% ${v.of ?? ""}`;
  if (type === "intensity" && v.descriptor) return ` · ${v.descriptor}`;
  return "";
}

/**
 * Storage keeps the legacy `zoom` enum value, but every render path
 * maps it to "online" — the user-facing language going forward.
 */
function prettySessionType(t: string): string {
  if (t === "in_app") return "in-app";
  if (t === "in_person") return "in person";
  if (t === "zoom") return "online";
  return t.replace("_", " ");
}
