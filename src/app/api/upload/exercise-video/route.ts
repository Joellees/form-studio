import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireTrainer } from "@/lib/trainer";

export const runtime = "nodejs";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB — matches the bucket limit
const ALLOWED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/**
 * Proxies a browser-side multipart upload into Supabase Storage using the
 * service role. The route authorizes the trainer via Clerk/Supabase before
 * writing, and files are stored under `{tenant_id}/{uuid}.{ext}` so RLS
 * policies on the storage bucket can enforce tenant isolation.
 */
export async function POST(req: Request) {
  let trainer;
  try {
    trainer = await requireTrainer();
  } catch {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "File exceeds 200MB limit" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: "Only mp4, mov, webm are supported" }, { status: 415 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const id = crypto.randomUUID();
  const path = `${trainer.id}/${id}.${ext}`;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from("exercise-videos").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data } = await admin.storage.from("exercise-videos").createSignedUrl(path, 60 * 60 * 24 * 365);
  return NextResponse.json({ ok: true, url: data?.signedUrl ?? path, path });
}
