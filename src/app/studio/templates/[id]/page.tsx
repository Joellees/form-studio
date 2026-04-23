import { notFound } from "next/navigation";

import { TemplateBuilder } from "./template-builder";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: template } = await supabase
    .from("session_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!template) notFound();

  const [{ data: blocks }, { data: exercises }] = await Promise.all([
    supabase
      .from("template_blocks")
      .select(
        `id, order_index, round_label, round_count, round_rest_seconds,
         template_block_exercises(id, order_index, setup_override, exercise_id,
           exercises(id, name, default_descriptor),
           template_set_groups(id, order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds, intent_tag)
         )`,
      )
      .eq("template_id", id)
      .order("order_index"),
    supabase.from("exercises").select("id, name, group_tag").eq("archived", false).order("name"),
  ]);

  // Supabase nested selects type relations as arrays; the builder expects a
  // single related row. Normalize here so the client component stays clean.
  const normalized = (blocks ?? []).map((b) => {
    const bes = (b.template_block_exercises as unknown as Array<{
      id: string;
      order_index: number;
      setup_override: string | null;
      exercise_id: string;
      exercises: Array<{ id: string; name: string; default_descriptor: string | null }> | { id: string; name: string; default_descriptor: string | null } | null;
      template_set_groups: Array<Record<string, unknown>>;
    }>) ?? [];
    return {
      ...b,
      template_block_exercises: bes.map((be) => ({
        ...be,
        exercises: Array.isArray(be.exercises) ? (be.exercises[0] ?? null) : be.exercises,
      })),
    };
  });

  return (
    <div className="rise-in">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TemplateBuilder template={template} blocks={normalized as any} exercises={exercises ?? []} />
    </div>
  );
}
