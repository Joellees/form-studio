import { Wordmark } from "@/components/brand/wordmark";

type Props = {
  name: string;
  bio: string | null;
  coverImageUrl: string | null;
  profileImageUrl: string | null;
};

export function TrainerHero({ name, bio, coverImageUrl, profileImageUrl }: Props) {
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
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImageUrl} alt="" className="h-full w-full object-cover" />
        ) : profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profileImageUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-display text-6xl text-[color:var(--color-stone)] md:text-7xl">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
