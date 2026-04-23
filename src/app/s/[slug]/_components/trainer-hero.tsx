import { Wordmark } from "@/components/brand/wordmark";

type Props = {
  name: string;
  bio: string | null;
  coverImageUrl: string | null;
  profileImageUrl: string | null;
};

export function TrainerHero({ name, bio, coverImageUrl, profileImageUrl }: Props) {
  return (
    <section className="mx-auto grid max-w-[1180px] gap-12 px-6 pb-8 pt-14 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-24 rise-in">
      <div>
        <Wordmark variant="stacked" name={name} />
        <p className="mt-12 max-w-lg text-lg leading-relaxed text-[color:var(--color-ink)]/80">
          {bio ||
            "Personal training, written by hand. Every workout is yours — your schedule, your rhythm, your progress."}
        </p>
      </div>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[color:var(--color-parchment)]">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profileImageUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-display text-7xl text-[color:var(--color-stone)]">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
