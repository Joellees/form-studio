import { PackageForm } from "../_components/package-form";
import { PageHeader } from "@/components/ui/page-header";

export default function NewPackagePage() {
  return (
    <div className="mx-auto max-w-xl rise-in">
      <PageHeader
        eyebrow="packages"
        title="Create a package."
        subtitle="set the shape of a training block. you can edit or archive it later — existing subscriptions stay untouched."
      />
      <PackageForm mode="create" />
    </div>
  );
}
