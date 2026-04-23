import { NewClientForm } from "./new-client-form";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">clients</p>
      <h1 className="mt-2 font-display text-4xl">Add a client.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Record someone you already train, or send them a link to sign in themselves.
        An invite email goes out if you include one.
      </p>
      <NewClientForm />
    </div>
  );
}
