import { notFound } from "next/navigation";

import { TrainerHero } from "./_components/trainer-hero";
import { PackagesBlock } from "./_components/packages-block";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { isMissingColumnError } from "@/lib/postgrest-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

/**
 * Public, unauthenticated trainer studio page. Uses the admin client
 * because no session exists; we only expose the fields in `trainer_public`.
 */
export default async function TrainerPublicPage({ params }: Props) {
  const { slug } = await params;
  const admin = createSupabaseAdminClient();

  const { data: trainer } = await admin
    .from("trainer_public")
    .select("*")
    .eq("subdomain_slug", slug)
    .maybeSingle();
  if (!trainer) notFound();

  /* `description` was added by migration 0012. Until that's applied
   * on prod the column doesn't exist and a select that names it
   * fails with PostgREST 42703. Two-step pattern: try the wide
   * select first, fall back to the legacy column list on missing-
   * column. Display layer handles a missing `description` field by
   * just not rendering it. */
  const { data: packages } = await (async () => {
    const wide = await admin
      .from("packages")
      .select("id, name, description, session_count, duration_days, price_usd, cancellation_policy")
      .eq("tenant_id", trainer.id)
      .eq("active", true)
      .order("price_usd", { ascending: true });
    if (wide.error && isMissingColumnError(wide.error)) {
      return admin
        .from("packages")
        .select("id, name, session_count, duration_days, price_usd, cancellation_policy")
        .eq("tenant_id", trainer.id)
        .eq("active", true)
        .order("price_usd", { ascending: true });
    }
    return wide;
  })();

  const firstName = trainer.display_name?.split(" ")[0] ?? trainer.display_name ?? "";

  return (
    <main className="min-h-screen">
      <nav className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-5 py-4 md:px-6 md:py-6">
        <Wordmark variant="inline" name={firstName} />
        <div className="flex items-center gap-3 text-sm md:gap-4">
          <a
            href="#approach"
            className="hidden hover:text-[color:var(--color-moss-deep)] sm:inline"
          >
            approach
          </a>
          <a
            href="#packages"
            className="hidden hover:text-[color:var(--color-moss-deep)] sm:inline"
          >
            packages
          </a>
          <Button asChild size="sm">
            <a href="#packages">book a block</a>
          </Button>
        </div>
      </nav>

      <TrainerHero
        name={firstName}
        bio={trainer.bio}
        coverImageUrl={trainer.cover_image_url}
        profileImageUrl={trainer.profile_image_url}
      />

      <section
        id="approach"
        className="mx-auto max-w-[1180px] px-5 py-12 rise-in md:px-6 md:py-24"
      >
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)] md:mb-4">
          approach
        </p>
        <div className="grid gap-8 md:grid-cols-2 md:gap-16">
          <h2 className="font-display text-3xl leading-tight md:text-4xl">
            {trainer.display_name} trains one-to-one, with a bias toward strength that lasts.
          </h2>
          <p className="text-base text-[color:var(--color-ink)]/80 md:text-lg">
            {trainer.bio ||
              "Every session is planned, every cue is intentional, every block serves the next. No noise. No junk volume. Just work that compounds."}
          </p>
        </div>
      </section>

      <section
        id="packages"
        className="mx-auto max-w-[1180px] px-5 py-12 rise-in md:px-6 md:py-24"
      >
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)] md:mb-4">
          packages
        </p>
        <h2 className="font-display text-3xl leading-tight md:text-4xl">Work in blocks.</h2>
        <p className="mt-3 max-w-xl text-[color:var(--color-ink)]/75">
          Training happens in blocks, not subscriptions. Choose the length that matches your next season.
        </p>
        <div className="mt-8 md:mt-12">
          <PackagesBlock packages={packages ?? []} trainerName={firstName} />
        </div>
      </section>

      <footer className="mx-auto max-w-[1180px] px-5 py-8 text-xs text-[color:var(--color-stone)] md:px-6 md:py-10">
        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--color-stone-soft)] pt-6">
          <span>&copy; {new Date().getFullYear()} {trainer.display_name}</span>
          <Wordmark variant="inline-platform" className="text-sm" />
        </div>
      </footer>
    </main>
  );
}
