"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
// `BETA_COOKIE` no longer set from this flow — see comment below.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CLIENT_TENANT_COOKIE } from "@/lib/trainer";

const claimSchema = z.object({
  code: z.string().length(6),
  // Phone is optional. The trainer pre-fills it on the invite if they
  // know it; otherwise the client gets a one-tap onboarding and the
  // trainer can collect the phone later from inside the studio. This
  // is intentional — the invite landing page should not gate on a
  // form field that adds friction at the point of first impression.
  phone: z.string().min(3).max(40).nullable().optional(),
});

/**
 * Claims an unclaimed invite for the signed-in Clerk user. Creates the
 * `clients` row, seeds default log-field toggles, and marks the invite
 * as claimed. Idempotent: returns ok if the invite was already claimed
 * by this user (no error), so the auto-claim route can retry without
 * surfacing a dead-end.
 *
 * Logs at every step so future trainer↔client linkage bugs are
 * diagnosable from the deployment logs in under a minute.
 */
export async function claimInvite(raw: unknown): Promise<ActionResult<{ clientId: string }>> {
  return runAction(claimSchema, raw, async ({ code, phone }) => {
    const startedAt = Date.now();
    const upperCode = String(code ?? "").toUpperCase();
    console.info("invite.consume.start", { code: upperCode });

    const { userId } = await auth();
    if (!userId) {
      console.warn("invite.consume.unauthenticated", { code: upperCode });
      return fail("You need to sign in or sign up first.");
    }

    const admin = createSupabaseAdminClient();

    const { data: invite } = await admin
      .from("client_invites")
      .select(
        "code, tenant_id, email, display_name, phone, notes, claimed_at, claimed_by_clerk_id, package_id, packages(id, name, session_count, duration_days, price_usd)",
      )
      .eq("code", upperCode)
      .maybeSingle();

    console.info("invite.consume.lookup", {
      code: upperCode,
      userId,
      found: !!invite,
      tenantId: invite?.tenant_id ?? null,
      alreadyClaimed: !!invite?.claimed_at,
      claimedBy: invite?.claimed_by_clerk_id ?? null,
    });

    if (!invite) {
      console.warn("invite.consume.not_found", { code: upperCode });
      return fail("This invite link isn&rsquo;t valid.");
    }
    // Idempotent retry: if THIS user already claimed it, return ok
    // pointing at the existing client row. Only surface an error if a
    // *different* user claimed it (link was forwarded or reused).
    if (invite.claimed_at && invite.claimed_by_clerk_id && invite.claimed_by_clerk_id !== userId) {
      console.warn("invite.consume.claimed_by_other", {
        code: upperCode,
        attemptedBy: userId,
        claimedBy: invite.claimed_by_clerk_id,
      });
      return fail("This invite has already been used.");
    }
    if (invite.claimed_at && invite.claimed_by_clerk_id === userId) {
      const { data: existingClient } = await admin
        .from("clients")
        .select("id")
        .eq("clerk_id", userId)
        .eq("tenant_id", invite.tenant_id)
        .maybeSingle();
      if (existingClient) {
        console.info("invite.consume.idempotent_replay", {
          code: upperCode,
          clientId: existingClient.id,
          durationMs: Date.now() - startedAt,
        });
        return ok({ clientId: existingClient.id });
      }
    }

    // A Clerk user can be a client of any number of trainers; we only
    // dedupe within the same studio. Look up an existing membership
    // for THIS trainer specifically — not across all of them.
    const { data: existing } = await admin
      .from("clients")
      .select("id")
      .eq("clerk_id", userId)
      .eq("tenant_id", invite.tenant_id)
      .maybeSingle();

    // Use the invite's pre-filled phone if present; the optional
    // submitted phone overrides it. Either may be null.
    const resolvedPhone = (phone ?? invite.phone) || null;

    let clientId: string;
    if (existing) {
      // Same studio — update phone on the existing row only when we
      // have a fresh value (don't blank an existing phone).
      clientId = existing.id;
      if (resolvedPhone) {
        await admin.from("clients").update({ phone: resolvedPhone }).eq("id", clientId);
      }
      console.info("invite.consume.existing_membership", {
        code: upperCode,
        clientId,
        tenantId: invite.tenant_id,
        userId,
      });
    } else {
      const user = await currentUser();
      const email = invite.email || user?.primaryEmailAddress?.emailAddress || null;
      const displayName =
        invite.display_name || user?.firstName || user?.fullName || user?.username || "Client";

      // Look up by (tenant_id, email) to handle the trainer-pre-created
      // placeholder case: if the trainer added the client via the
      // /studio/clients/new form first (without an invite) and is now
      // sending an invite to the same email, we update that
      // placeholder row instead of creating a duplicate.
      let placeholderId: string | null = null;
      if (email) {
        const { data: byEmail } = await admin
          .from("clients")
          .select("id, clerk_id")
          .eq("tenant_id", invite.tenant_id)
          .ilike("email", email)
          .limit(2);
        const placeholderRows = (byEmail ?? []).filter((r) => !r.clerk_id);
        if (placeholderRows.length === 1) {
          placeholderId = placeholderRows[0]!.id as string;
        }
      }

      if (placeholderId) {
        const { error: updErr } = await admin
          .from("clients")
          .update({
            clerk_id: userId,
            display_name: displayName,
            phone: resolvedPhone,
          })
          .eq("id", placeholderId);
        if (updErr) {
          console.error("invite.consume.placeholder_update_failed", {
            code: upperCode,
            placeholderId,
            error: updErr.message,
          });
          return fail(updErr.message);
        }
        clientId = placeholderId;
        console.info("invite.consume.placeholder_match", {
          code: upperCode,
          email,
          clientId,
          tenantId: invite.tenant_id,
        });
      } else {
        const { data: inserted, error } = await admin
          .from("clients")
          .insert({
            tenant_id: invite.tenant_id,
            clerk_id: userId,
            display_name: displayName,
            email,
            phone: resolvedPhone,
            notes: invite.notes ?? null,
          })
          .select("id")
          .single();
        if (error) {
          // The legacy unique(clerk_id) constraint is gone post-migration
          // 0003. If we hit it again, it means the migration hasn't been
          // applied — surface that explicitly so the trainer or admin
          // knows what to do instead of the raw Postgres message.
          if (error.message?.includes("clients_clerk_id_key")) {
            console.error("invite.consume.migration_missing", {
              code: upperCode,
              error: error.message,
            });
            return fail(
              "Multi-trainer support isn&rsquo;t enabled yet on this database. Ask the admin to run migration 0003.",
            );
          }
          console.error("invite.consume.insert_failed", {
            code: upperCode,
            userId,
            tenantId: invite.tenant_id,
            error: error.message,
          });
          return fail(error.message);
        }
        clientId = inserted.id;

        await admin.from("client_profile_fields").insert({
          client_id: clientId,
          tenant_id: invite.tenant_id,
          weight: true,
        });

        console.info("invite.consume.client_created", {
          code: upperCode,
          clientId,
          tenantId: invite.tenant_id,
          userId,
        });
      }
    }

    // If the trainer attached a package to this invite, create the
    // first month's subscription on the client's behalf so they land
    // in their portal with their plan already set up. Marked as
    // pending until payment is recorded (Phase 2 Stripe integration).
    if (invite.package_id) {
      const pkg = Array.isArray(invite.packages) ? invite.packages[0] : invite.packages;
      if (pkg) {
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const { data: existingSub } = await admin
          .from("subscriptions")
          .select("id")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!existingSub) {
          await admin.from("subscriptions").insert({
            tenant_id: invite.tenant_id,
            client_id: clientId,
            package_id: invite.package_id,
            start_date: today.toISOString().slice(0, 10),
            end_date: nextMonth.toISOString().slice(0, 10),
            sessions_remaining: 0,
            payment_status: "pending",
            payment_method: "manual",
            auto_renew: false,
            next_renewal_date: nextMonth.toISOString().slice(0, 10),
          });
        }
      }
    }

    await admin
      .from("client_invites")
      .update({ claimed_by_clerk_id: userId, claimed_at: new Date().toISOString() })
      .eq("code", invite.code);

    console.info("invite.consume.success", {
      code: upperCode,
      clientId,
      tenantId: invite.tenant_id,
      userId,
      durationMs: Date.now() - startedAt,
    });

    const jar = await cookies();

    // Pin the active studio to the one just claimed so the post-claim
    // redirect to /client lands on the right portal — even if the user
    // is also a client of other trainers.
    jar.set(CLIENT_TENANT_COOKIE, invite.tenant_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });

    // Beta-gate cookie is intentionally NOT stamped here.
    //
    // This action runs after a Clerk sign-in, so the user is
    // authenticated. The middleware beta gate is signed-out-only
    // (`if (!userId)`), so the cookie is redundant in the immediate
    // post-claim flow. If the user signs out later and returns,
    // `/sign-in` is gate-exempt — they sign in and middleware lets
    // them through.
    //
    // The previous implementation stamped the cookie with "the first
    // value from the BETA_CODES env var" — which was empty in
    // production and was the trigger for the middleware ↔ /beta
    // redirect loop fixed alongside this change.

    return ok({ clientId });
  });
}
