import { notFound } from "next/navigation";

import { PackageForm } from "../_components/package-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: pkg } = await supabase.from("packages").select("*").eq("id", id).maybeSingle();
  if (!pkg) notFound();

  return (
    <div className="mx-auto max-w-xl rise-in">
      <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">package</p>
      <h1 className="mt-2 text-4xl">{pkg.name}</h1>
      <PackageForm mode="edit" initial={pkg} />
    </div>
  );
}
