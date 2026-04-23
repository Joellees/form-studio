import { notFound } from "next/navigation";

import { TrainerHero } from "./_components/trainer-hero";
import { PackagesBlock } from "./_components/packages-block";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
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

  const { data: packages } = await admin
    .from("packages")
    .select("id, name, session_type_mix, session_count, duration_days, price_usd, cancellation_policy")
    .eq("tenant_id", trainer.id)
    .eq("active", true)
    .order("price_usd", { ascending: true });

  const firstName = trainer.display_name?.split(" ")[0] ?? trainer.display_name ?? "";

  return (
    <main className="min-h-screen">
      <nav className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-6">
        <Wordmark variant="inline" name={firstName} />
        <div className="flex items-center gap-4 text-sm">
          <a href="#approach" className="hover:text-[color:var(--color-moss-deep)]">approach</a>
          <a href="#packages" className="hover:text-[color:var(--color-moss-deep)]">packages</a>
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

      <section id="approach" className="mx-auto max-w-[1180px] px-6 py-24 rise-in">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">approach</p>
        <div className="grid gap-16 md:grid-cols-2">
          <h2 className="font-display text-4xl leading-tight">
            {trainer.display_name} trains one-to-one, with a bias toward strength that lasts.
          </h2>
          <p className="text-lg text-[color:var(--color-ink)]/80">
            {trainer.bio ||
              "Every session is planned, every cue is intentional, every block serves the next. No noise. No junk volume. Just work that compounds."}
          </p>
        </div>
      </section>

      <section id="packages" className="mx-auto max-w-[1180px] px-6 py-24 rise-in">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">packages</p>
        <h2 className="font-display text-4xl leading-tight">Work in blocks.</h2>
        <p className="mt-3 max-w-xl text-[color:var(--color-ink)]/75">
          Training happens in blocks, not subscriptions. Choose the length that matches your next season.
        </p>
        <div className="mt-12">
          <PackagesBlock packages={packages ?? []} trainerName={firstName} />
        </div>
      </section>

      <footer className="mx-auto max-w-[1180px] px-6 py-10 text-xs text-[color:var(--color-stone)]">
        <div className="flex items-center justify-between border-t border-[color:var(--color-stone-soft)] pt-6">
          <span>&copy; {new Date().getFullYear()} {trainer.display_name}</span>
          <Wordmark variant="inline-platform" className="text-sm" />
        </div>
      </footer>
    </main>
  );
}
