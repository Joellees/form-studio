import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getOnboardingWarning } from "@/lib/onboarding-warning";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "971507305023";

/**
 * Surfaces `trainers.onboarding_warning` to the trainer with a
 * support CTA. We route here from the studio layout when the
 * access-code bind step couldn't complete cleanly — orphaned
 * binding, missing cookie, revoked code, etc. Strictly better than
 * dumping the trainer on `/studio/expired` with the wrong cohort
 * defaults and a confusing pay-us page.
 *
 * If the warning was cleared between the layout's check and this
 * page's render (e.g. an admin fixed the binding mid-session),
 * silently redirect back to `/studio` — the layout's gate will pass
 * and they'll land on their dashboard.
 *
 * Reachable only via the layout's redirect, but defended against
 * direct navigation: if there's no warning, we kick back to studio.
 */
export default async function OnboardingIssuePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const admin = createSupabaseAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, display_name")
    .eq("clerk_id", userId)
    .maybeSingle();
  if (!trainer) redirect("/onboarding");

  const trainerRow = trainer as { id: string; display_name: string };
  const warning = await getOnboardingWarning(admin, trainerRow.id);
  if (!warning) redirect("/studio");

  const firstName = trainerRow.display_name.split(" ")[0] ?? trainerRow.display_name;
  const waMessage = `Hi Form Studio — I'm hitting an onboarding issue and need a hand. (${firstName})`;
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
    waMessage,
  )}`;

  return (
    <main
      className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-10 rise-in md:px-6 md:py-16"
      style={{ background: "#F2EDE3" }}
    >
      <p className="font-display text-[20px] leading-none text-[color:var(--color-moss)] md:text-[26px]">
        Form Studio
      </p>

      <section className="mt-12 md:mt-20">
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
          We need a hand from our end.
        </h1>
        <p className="mt-3 text-[color:var(--color-ink)]/75">{warning}</p>
      </section>

      <div className="mt-8 flex flex-col gap-3">
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center rounded-full bg-[color:var(--color-ink)] px-7 text-[15px] font-medium text-[color:var(--color-canvas)] shadow-[0_1px_0_rgba(31,30,27,0.15),0_6px_18px_-8px_rgba(31,30,27,0.35)] hover:bg-[color:var(--color-moss-deep)]"
        >
          Message us on WhatsApp
        </a>
        <p className="text-center text-xs text-[color:var(--color-stone)]">
          Once we get back to you, refresh this page and you&rsquo;ll be in.
        </p>
      </div>
    </main>
  );
}
