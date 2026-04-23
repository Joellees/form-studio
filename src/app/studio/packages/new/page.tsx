import { PackageForm } from "../_components/package-form";

export default function NewPackagePage() {
  return (
    <div className="mx-auto max-w-xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">packages</p>
      <h1 className="mt-2 font-display text-4xl">Design a package.</h1>
      <p className="mt-3 text-[color:var(--color-ink)]/75">
        Set the shape of a training block. You can edit or archive later — existing
        subscriptions are unaffected.
      </p>
      <PackageForm mode="create" />
    </div>
  );
}
