"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BETA_COOKIE, isValidBetaCode, parseBetaCodes } from "@/lib/beta";

/**
 * Validates the submitted code against BETA_CODES and sets a signed
 * cookie. Cookie value is the matched code so middleware can re-verify
 * on each request (in case we rotate codes without reissuing cookies).
 */
export async function enterBeta(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "/") || "/";

  const codes = parseBetaCodes(process.env.BETA_CODES);
  const match = isValidBetaCode(code, codes);

  if (!match) {
    redirect(`/beta?error=1&next=${encodeURIComponent(next)}`);
  }

  const jar = await cookies();
  jar.set(BETA_COOKIE, match.code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect(next);
}
