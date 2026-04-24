import { notFound } from "next/navigation";

import { PackageForm } from "../_components/package-form";
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
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">package</p>
      <h1 className="mt-2 text-4xl">{pkg.name}</h1>
      <PackageForm mode="edit" initial={pkg} />
    </div>
  );
}
