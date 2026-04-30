import { Wordmark } from "@/components/brand/wordmark";

type Props = {
  name: string;
  bio: string | null;
  coverImageUrl: string | null;
  profileImageUrl: string | null;
};

export function TrainerHero({ name, bio, coverImageUrl, profileImageUrl }: Props) {
  const imageSrc = coverImageUrl ?? profileImageUrl ?? null;

  // No image set? Stark text-only hero. Don't reserve a 4:5 frame for
  // a placeholder initial — it screams "missing image" to visitors.
  if (!imageSrc) {
    return (
      <section className="rise-in mx-auto max-w-[1180px] px-5 pb-6 pt-12 md:px-6 md:pb-8 md:pt-24">
        <Wordmark variant="stacked" name={name} />
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-[color:var(--color-ink)]/80 md:mt-10 md:text-lg">
          {bio ||
            "Personal training, written by hand. Every workout is yours — your schedule, your rhythm, your progress."}
        </p>
      </section>
    );
  }

  return (
    <section className="rise-in mx-auto grid max-w-[1180px] gap-8 px-5 pb-6 pt-8 md:grid-cols-[1.1fr_0.9fr] md:items-center md:gap-12 md:px-6 md:pb-8 md:pt-24">
      <div>
        <Wordmark variant="stacked" name={name} />
        <p className="mt-6 max-w-lg text-base leading-relaxed text-[color:var(--color-ink)]/80 md:mt-12 md:text-lg">
          {bio ||
            "Personal training, written by hand. Every workout is yours — your schedule, your rhythm, your progress."}
        </p>
      </div>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[color:var(--color-parchment)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt={name} className="h-full w-full object-cover" />
      </div>
    </section>
  );
}
