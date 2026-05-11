import { redirect } from "next/navigation";

import { CalendarSection } from "../calendar-section";
import { ProfileSection } from "../profile-section";
import { WelcomeBanner } from "../welcome-banner";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { canClientCancel, formatInTz } from "@/lib/schedule";
import { requireClient } from "@/lib/trainer";
import { getSignInUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

/**
 * Client portal — canonical URL at `/client/dashboard` for parity with
 * `/studio/dashboard` and so the post-invite-claim address bar reads
 * naturally. `/client` is kept as a redirect alias.
 *
 * Single page: profile strip up top (name, package, note-to-trainer)
 * and the calendar below, where every client action (request, cancel,
 * log cycle, request extra in-app) is wired inline.
 */
export default async function ClientDashboard({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const sp = await searchParams;
  // requireClient throws "PICK_STUDIO" when the user is a member of
  // multiple studios and we can't tell which one they meant. Catch
  // and redirect to the picker; everything else is unexpected.
  let client;
  try {
    client = await requireClient();
  } catch (err) {
    if (err instanceof Error && err.message === "PICK_STUDIO") redirect("/client/pick");
    throw err;
  }
  const admin = createSupabaseAdminClient();

  const [
    { data: me },
    { data: subs },
    { data: packages },
    { data: sessions },
    { data: fields },
  ] = await Promise.all([
    admin
      .from("clients")
      .select(
        "*, trainers(display_name, subdomain_slug, timezone)",
      )
      .eq("id", client.id)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select(
        "id, payment_status, sessions_remaining, package_id, pending_package_id, next_renewal_date, packages!subscriptions_package_id_fkey(name, session_count, price_usd)",
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    admin
      .from("packages")
      .select("id, name, session_count, price_usd")
      .eq("tenant_id", client.tenantId)
      .eq("active", true)
      .order("price_usd"),
    admin
      .from("sessions")
      .select(
        "id, scheduled_at, duration_minutes, session_type, in_app_origin, in_app_surcharge_paid, status, name, zoom_url, notes",
      )
      .eq("client_id", client.id)
      .order("scheduled_at"),
    admin
      .from("client_profile_fields")
      .select("cycle")
      .eq("client_id", client.id)
      .maybeSingle(),
  ]);

  const trainersRel = me?.trainers as
    | { display_name?: string; subdomain_slug?: string; timezone?: string }
    | { display_name?: string; subdomain_slug?: string; timezone?: string }[]
    | null;
  const trainer = Array.isArray(trainersRel) ? trainersRel[0] ?? null : trainersRel;
  const trainerName = trainer?.display_name ?? "your trainer";
  const firstName = trainerName.split(" ")[0] ?? trainerName;
  const tz = me?.timezone ?? trainer?.timezone ?? "UTC";
  // Cutoff math runs in the trainer's timezone — that's what defines
  // "the day before". Default to UTC if the trainer never set one.
  const trainerTz = trainer?.timezone ?? "UTC";

  const pending = subs?.find((s) => s.payment_status === "pending");
  const active = subs?.find(
    (s) => s.payment_status === "paid" && (s.sessions_remaining ?? 0) > 0,
  );
  const activePkg = pkgOf(active?.packages);
  const pendingPkg = pkgOf(pending?.packages);

  const now = new Date();
  const upcoming = (sessions ?? [])
    .filter((s) => new Date(s.scheduled_at) > now && s.status !== "cancelled")
    .map((s) => ({
      ...s,
      session_type: s.session_type as "in_person" | "zoom" | "in_app",
      in_app_origin: (s.in_app_origin ?? null) as "trainer_pushed" | "client_requested" | null,
      in_app_surcharge_paid: (s.in_app_surcharge_paid ?? null) as boolean | null,
      status: s.status as "scheduled" | "completed" | "cancelled" | "requested" | "declined",
      formattedWhen: formatInTz(new Date(s.scheduled_at), tz, "EEE, MMM d · HH:mm"),
      formattedDay: formatInTz(new Date(s.scheduled_at), tz, "EEE, MMM d"),
      canCancel: canClientCancel(new Date(s.scheduled_at), trainerTz, now),
    }));
  const past = (sessions ?? [])
    .filter((s) => new Date(s.scheduled_at) <= now || s.status === "cancelled")
    .reverse()
    .map((s) => ({
      ...s,
      session_type: s.session_type as "in_person" | "zoom" | "in_app",
      in_app_origin: (s.in_app_origin ?? null) as "trainer_pushed" | "client_requested" | null,
      in_app_surcharge_paid: (s.in_app_surcharge_paid ?? null) as boolean | null,
      status: s.status as "scheduled" | "completed" | "cancelled" | "requested" | "declined",
      formattedWhen: formatInTz(new Date(s.scheduled_at), tz, "EEE, MMM d · HH:mm"),
      formattedDay: formatInTz(new Date(s.scheduled_at), tz, "EEE, MMM d"),
      canCancel: false,
    }));

  const signInUrl = buildSignInUrl(trainer?.subdomain_slug ?? null);

  return (
    <div className="rise-in-stagger space-y-5 md:space-y-8">
      {sp.welcome ? <WelcomeBanner trainerName={firstName} signInUrl={signInUrl} /> : null}

      <ProfileSection
        displayName={me?.display_name ?? "Client"}
        trainerName={firstName}
        noteToTrainer={(me as { note_to_trainer?: string | null } | null)?.note_to_trainer ?? null}
        active={
          active
            ? {
                subscriptionId: active.id,
                packageId: active.package_id ?? "",
                packageName: activePkg?.name ?? "package",
                sessionsRemaining: active.sessions_remaining ?? 0,
                sessionCount: activePkg?.session_count ?? active.sessions_remaining ?? 0,
                pendingPackageId: active.pending_package_id ?? null,
                nextRenewal: active.next_renewal_date,
              }
            : null
        }
        pending={
          pending
            ? {
                subscriptionId: pending.id,
                packageName: pendingPkg?.name ?? "your package",
                sessionCount: pendingPkg?.session_count ?? 0,
              }
            : null
        }
        packages={(packages ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          session_count: p.session_count,
          price_usd: p.price_usd,
        }))}
      />

      <CalendarSection
        upcoming={upcoming}
        past={past}
        cycleEnabled={fields?.cycle ?? false}
      />
    </div>
  );
}

function pkgOf(p: unknown): { name?: string; session_count?: number; price_usd?: number } | null {
  if (!p) return null;
  if (Array.isArray(p)) return (p[0] ?? null) as { name?: string } | null;
  return p as { name?: string };
}

function buildSignInUrl(_slug: string | null): string {
  // Apex sign-in URL — works everywhere; post-sign-in routing lands
  // the client on the right portal regardless of where they came
  // from. Goes through `getSignInUrl()` so the domain is a single
  // env-var change away.
  return getSignInUrl();
}
