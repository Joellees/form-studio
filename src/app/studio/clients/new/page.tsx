import { NewClientForm } from "./new-client-form";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">clients</p>
      <h1 className="mt-2 text-4xl">Add a client.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Ask your client to create their account at <span className="font-mono">/join</span> first —
        they&rsquo;ll get a 6-letter code. Enter it below to add them to your studio.
      </p>
      <NewClientForm />
    </div>
  );
}
