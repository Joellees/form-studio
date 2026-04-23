/**
 * Beta gate — parses `BETA_CODES` from the environment as a list of
 * `code:label` pairs, one per comma-separated entry.
 *
 * Example: `BETA_CODES="trainer-joelle:Joelle,friend-rand:Rand"`
 *
 * The `code` is what the visitor types on /beta; the `label` shows up
 * in cookies/logs so we know who entered.
 */
export type BetaCode = { code: string; label: string };

export const BETA_COOKIE = "fs_beta";

export function parseBetaCodes(raw: string | undefined): BetaCode[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code, ...labelParts] = entry.split(":");
      return { code: code!.trim(), label: labelParts.join(":").trim() || code!.trim() };
    })
    .filter((c) => c.code.length > 0);
}

export function isValidBetaCode(code: string, codes: BetaCode[]): BetaCode | null {
  const match = codes.find((c) => c.code.toLowerCase() === code.toLowerCase().trim());
  return match ?? null;
}
