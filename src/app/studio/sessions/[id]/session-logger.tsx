"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logPerformedSet } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatReps, formatWeight, type RepValue, type WeightValue } from "@/lib/set-group";

type SetGroup = {
  id: string;
  order_index: number;
  label: string | null;
  sets: number;
  rep_type: string;
  rep_value: unknown;
  weight_type: string;
  weight_value: unknown;
  rest_seconds: number | null;
  performed_sets: number | null;
  performed_reps: unknown;
  performed_weight: unknown;
  performed_notes: string | null;
};

type BlockExercise = {
  id: string;
  order_index: number;
  setup_override: string | null;
  exercises: { id: string; name: string; default_descriptor: string | null; video_url: string | null } | null | Array<unknown>;
  session_set_groups: SetGroup[];
};

type Block = {
  id: string;
  order_index: number;
  session_block_exercises: BlockExercise[];
};

export function SessionLogger({ sessionId: _sessionId, blocks }: { sessionId: string; blocks: Block[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-ink)]/70">
        Nothing was prescribed for this session. You can still log notes, or schedule with a template next time.
      </p>
    );
  }

  function saveSet(id: string, partial: { performed_sets?: number; performed_notes?: string | null }) {
    startTransition(async () => {
      await logPerformedSet({ id, ...partial });
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {blocks.map((block) => {
        return block.session_block_exercises.map((be) => {
          const exercise = Array.isArray(be.exercises) ? null : be.exercises;
          const sgs = [...be.session_set_groups].sort((a, b) => a.order_index - b.order_index);
          return (
            <div key={be.id} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl">{exercise?.name ?? "Exercise"}</h3>
                {exercise?.video_url ? (
                  <a
                    href={exercise.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[color:var(--color-moss)]"
                  >
                    watch
                  </a>
                ) : null}
              </div>
              {exercise?.default_descriptor ? (
                <p className="text-sm text-[color:var(--color-ink)]/70">{exercise.default_descriptor}</p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                      <th className="py-2 pr-4">set</th>
                      <th className="py-2 pr-4">prescribed</th>
                      <th className="py-2 pr-4">done</th>
                      <th className="py-2 pr-4">notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sgs.map((sg) => (
                      <tr key={sg.id} className="border-t border-[color:var(--color-stone-soft)]/60">
                        <td className="py-2 pr-4">
                          {sg.label ? <Badge tone="stone">{sg.label}</Badge> : null} {sg.sets}
                        </td>
                        <td className="py-2 pr-4">
                          {formatReps(sg.rep_value as RepValue)} · {formatWeight(sg.weight_value as WeightValue)}
                          {sg.rest_seconds ? (
                            <span className="ml-2 text-xs text-[color:var(--color-stone)]">rest {sg.rest_seconds}s</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            className="h-9 w-20"
                            type="number"
                            min={0}
                            defaultValue={sg.performed_sets ?? ""}
                            onBlur={(e) => saveSet(sg.id, { performed_sets: Number(e.target.value) || 0 })}
                            disabled={pending}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            className="h-9"
                            defaultValue={sg.performed_notes ?? ""}
                            onBlur={(e) => saveSet(sg.id, { performed_notes: e.target.value || null })}
                            disabled={pending}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        });
      })}
    </div>
  );
}
