import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CodesTable, type CodeRow } from "./codes-table";
import { Wordmark } from "@/components/brand/wordmark";
import { isSuperAdmin } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminCodesPage() {
  const { userId } = await auth();
  if (!userId || !isSuperAdmin(userId)) notFound();

  const supabase = createSupabaseAdminClient();
  const { data: codes } = await supabase
    .from("access_codes")
    .select(
      "id, code, cohort, label, bound_to_clerk_user_id, bound_to_studio_id, redemption_count, last_redeemed_at, revoked, revoked_at, created_at, note",
    )
    .order("created_at", { ascending: false });

  // Resolve trainer names for codes that bound to a studio
  const studioIds = (codes ?? [])
    .map((c) => c.bound_to_studio_id as string | null)
    .filter((v): v is string => !!v);
  const studioMap = new Map<string, string>();
  if (studioIds.length > 0) {
    const { data: studios } = await supabase
      .from("trainers")
      .select("id, display_name")
      .in("id", studioIds);
    for (const s of studios ?? []) {
      studioMap.set(s.id as string, (s.display_name as string) ?? "—");
    }
  }

  const rows: CodeRow[] = (codes ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    cohort: (c.cohort as string) ?? "",
    label: (c.label as string) ?? null,
    revoked: !!c.revoked,
    redemptionCount: (c.redemption_count as number) ?? 0,
    lastRedeemedAt: (c.last_redeemed_at as string) ?? null,
    boundStudioId: (c.bound_to_studio_id as string) ?? null,
    boundTrainerName: c.bound_to_studio_id
      ? studioMap.get(c.bound_to_studio_id as string) ?? "—"
      : null,
    createdAt: (c.created_at as string) ?? null,
    note: (c.note as string) ?? null,
  }));

  return (
    <main className="mx-auto max-w-[1280px] px-5 py-8 md:px-8 md:py-12">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Wordmark variant="inline-platform" />
          <span className="rounded-full bg-[color:var(--color-moss)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss-deep)]">
            admin
          </span>
        </div>
        <Link
          href="/admin"
          className="text-sm text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
        >
          ← trainers
        </Link>
      </div>

      <section className="mt-8">
        <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">
          access codes
        </p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl">
          Every code on the platform.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[color:var(--color-ink)]/65">
          Generate codes, copy them as ready-to-send WhatsApp messages, and
          revoke unused ones. Codes are 1:1 with trainers via Clerk userid
          binding — once a code is claimed, no other user can redeem it.
        </p>
      </section>

      <CodesTable rows={rows} />
    </main>
  );
}
