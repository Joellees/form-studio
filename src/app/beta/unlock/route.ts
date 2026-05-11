import { NextResponse, type NextRequest } from "next/server";

import { redeemAccessCode } from "@/app/beta/actions";

/**
 * One-shot unlock link. `/beta/unlock?code=XYZ&next=/path` redeems
 * the code via the DB-backed flow + sets the `fs_beta` cookie + 307s
 * to `next`. No form, no typing.
 *
 * Wraps `redeemAccessCode`, which:
 *   - validates the code against `public.access_codes`
 *   - rejects revoked codes
 *   - binds the code to the signed-in Clerk user if one is present
 *     and the code is unbound
 *   - rejects redemption attempts by a different user when the code
 *     is already bound
 *
 * Bad codes bounce to `/beta?error=1` so the recipient lands on the
 * gate form with the usual error.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const url = req.nextUrl;
  const code = (url.searchParams.get("code") ?? "").trim();
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    const fallback = req.nextUrl.clone();
    fallback.pathname = "/beta";
    fallback.search = `?error=1&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(fallback);
  }

  const result = await redeemAccessCode({ code, next });

  if (!result.ok) {
    const fallback = req.nextUrl.clone();
    fallback.pathname = "/beta";
    fallback.search = `?error=1&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(fallback);
  }

  const target = req.nextUrl.clone();
  target.pathname = next.startsWith("/") ? next : "/";
  target.search = "";
  return NextResponse.redirect(target);
}
