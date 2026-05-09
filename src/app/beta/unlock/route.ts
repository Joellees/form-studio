import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { BETA_COOKIE, isValidBetaCode, parseBetaCodes } from "@/lib/beta";

/**
 * One-shot unlock link. Hit `/beta/unlock?code=XYZ&next=/studio/dashboard`
 * to set the beta cookie and redirect to `next` in a single request —
 * no form, no typing.
 *
 * Use case: handing a tester a link they can click without
 * remembering or typing a code. Same validation as the form
 * (validates against `BETA_CODES`), so a bad/stale code falls back
 * to the gate page with the usual error.
 *
 * The route lives under `/beta/*` which is already in the
 * middleware's `BETA_EXEMPT_PREFIXES` list, so it doesn't infinite-
 * loop with the gate.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const url = req.nextUrl;
  const code = (url.searchParams.get("code") ?? "").trim();
  const next = url.searchParams.get("next") ?? "/";

  const codes = parseBetaCodes(process.env.BETA_CODES);
  const match = isValidBetaCode(code, codes);

  if (!match) {
    // Bounce to the gate with the usual error so the recipient gets
    // a clear "that code isn't valid" message (and a chance to type
    // a different one).
    const fallback = req.nextUrl.clone();
    fallback.pathname = "/beta";
    fallback.search = `?error=1&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(fallback);
  }

  const target = req.nextUrl.clone();
  // Always strip the query so the unlock URL doesn't end up as
  // referrer when the destination page makes outbound calls.
  target.pathname = next.startsWith("/") ? next : "/";
  target.search = "";

  const res = NextResponse.redirect(target);
  res.cookies.set(BETA_COOKIE, match.code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
