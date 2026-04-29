"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireClient } from "@/lib/trainer";

/**
 * Server actions that live on the client portal. They authorize via
 * `requireClient()`, which resolves the signed-in Clerk user back to a
 * row in `clients` — no separate client_id is ever trusted from the
 * caller.
 */

const noteSchema = z.object({
  note: z.string().max(2000).nullable().or(z.literal("").transform(() => null)),
});

/**
 * The free-form note from client to trainer, shown on both sides. We
 * trim and null-out empties so the trainer doesn't see an empty quote.
 */
export async function updateNoteToTrainer(raw: unknown): Promise<ActionResult<void>> {
  return runAction(noteSchema, raw, async ({ note }) => {
    const client = await requireClient();
    const admin = createSupabaseAdminClient();
    const value = note?.trim() ? note.trim() : null;
    const { error } = await admin
      .from("clients")
      .update({ note_to_trainer: value })
      .eq("id", client.id);
    if (error) {
      // Friendlier copy if the migration hasn't shipped yet.
      if (error.message?.toLowerCase().includes("column") && error.message?.toLowerCase().includes("note_to_trainer")) {
        return fail("This studio hasn&rsquo;t enabled notes yet.");
      }
      return fail(error.message);
    }
    revalidatePath("/client");
    revalidatePath(`/studio/clients/${client.id}`);
    return ok();
  });
}

const upgradeSchema = z.object({ sessionId: z.string().uuid() });

/**
 * Client asks to convert one of their scheduled sessions into an
 * in-app session (+$5). We stash a marker in the session notes so the
 * trainer sees it from the calendar — they can then flip the type in
 * one click via their existing inline dropdown. No silent type change.
 */
export async function requestInAppUpgrade(raw: unknown): Promise<ActionResult<void>> {
  return runAction(upgradeSchema, raw, async ({ sessionId }) => {
    const client = await requireClient();
    const admin = createSupabaseAdminClient();

    const { data: session } = await admin
      .from("sessions")
      .select("id, client_id, notes, session_type, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session || session.client_id !== client.id) return fail("Not your session.");
    if (session.session_type === "in_app") return fail("Already in-app.");
    if (session.status === "cancelled" || session.status === "completed") {
      return fail("This session is closed.");
    }

    const marker = "[client requested in-app upgrade]";
    const next = (session.notes ?? "").includes(marker)
      ? session.notes
      : `${session.notes ?? ""}\n${marker} (+$5) — sent ${new Date().toISOString().slice(0, 10)}`.trim();

    const { error } = await admin
      .from("sessions")
      .update({ notes: next })
      .eq("id", sessionId);
    if (error) return fail(error.message);

    revalidatePath("/client");
    revalidatePath("/studio/calendar");
    return ok();
  });
}

const cycleSchema = z.object({
  phase: z.enum(["menstrual", "follicular", "ovulation", "luteal"]),
  notes: z.string().max(500).nullable().or(z.literal("").transform(() => null)),
});

/**
 * Cycle log — the only log type the client can write from the portal
 * in v1. Other log types are tracked by the trainer or auto-generated
 * (PRs, weight). Gated on the client_profile_fields.cycle toggle.
 */
export async function logCycle(raw: unknown): Promise<ActionResult<void>> {
  return runAction(cycleSchema, raw, async ({ phase, notes }) => {
    const client = await requireClient();
    const admin = createSupabaseAdminClient();

    const { data: fields } = await admin
      .from("client_profile_fields")
      .select("cycle")
      .eq("client_id", client.id)
      .maybeSingle();
    if (!fields?.cycle) return fail("Cycle logging isn't enabled.");

    const { error } = await admin.from("client_logs").insert({
      client_id: client.id,
      tenant_id: client.tenantId,
      field_type: "cycle",
      value: { phase },
      notes,
    });
    if (error) return fail(error.message);
    revalidatePath("/client");
    return ok();
  });
}
