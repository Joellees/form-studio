import { notFound } from "next/navigation";

import { AssignToClientsButton } from "../_components/assign-to-clients-button";
import { PackageForm } from "../_components/package-form";
import { PageHeader } from "@/components/ui/page-header";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainer = await requireTrainer();
  const admin = createSupabaseAdminClient();
  const { data: pkg } = await admin
    .from("packages")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", trainer.id)
    .maybeSingle();
  if (!pkg) notFound();

  return (
    <div className="mx-auto max-w-xl rise-in">
      <PageHeader
        eyebrow="package"
        title={pkg.name}
        actions={
          /* Inverse-direction entry point to the existing assignment
            * flow: instead of "from this client, pick a package" the
            * trainer can "from this package, pick clients (multi)."
            * Same `assignPackage` server action under the hood — this
            * just opens a sheet that loops it. The single-client flow
            * on /studio/clients/[id] stays untouched. */
          <AssignToClientsButton packageId={pkg.id} packageName={pkg.name} />
        }
      />
      <PackageForm mode="edit" initial={pkg} />
    </div>
  );
}
