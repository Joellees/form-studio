import { InviteGenerator } from "./invite-generator";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">clients</p>
      <h1 className="mt-2 text-4xl">Invite a client.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Generate a single-use link. Send it to your client — they&rsquo;ll sign up or sign in, and
        land in your studio as a client of yours.
      </p>
      <InviteGenerator />
    </div>
  );
}
