/**
 * Read-only "preview" mode for stateless tooling (Claude chat,
 * web_fetch, etc.) that can't hold cookies between requests.
 *
 * How it works:
 *   - A request carrying `?fs_preview=<TOKEN>` (or `X-Fs-Preview:
 *     <TOKEN>` header) where the value matches `BETA_PREVIEW_TOKEN`
 *     is treated as authenticated AS the seed trainer (Joelle).
 *   - Middleware sets `x-fs-preview: 1` on the forwarded request,
 *     so server components / actions can detect preview mode.
 *   - The middleware blocks any non-GET/HEAD request in preview
 *     mode so no mutation can leak through.
 *
 * Limits:
 *   - Read-only (mutations rejected at the edge).
 *   - Maps to one fixed trainer slug (`PREVIEW_TRAINER_SLUG`) so
 *     the tooling sees a populated studio. Not configurable per
 *     request — that's deliberate, keeps the surface tiny.
 *   - The token is not a substitute for Clerk auth in normal flows.
 *     If `BETA_PREVIEW_TOKEN` is unset the whole feature is off.
 */

export const PREVIEW_HEADER = "x-fs-preview";
export const PREVIEW_QUERY = "fs_preview";

/** The seed trainer the preview impersonates. */
export const PREVIEW_TRAINER_SLUG = "joelle";

export function isPreviewToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const expected = process.env.BETA_PREVIEW_TOKEN;
  if (!expected) return false;
  return value === expected;
}

/**
 * Whether the *current* request is a preview-mode request. Reads the
 * marker header set by middleware. Server components and server
 * actions call this via `headers().get(PREVIEW_HEADER)`.
 */
export function isPreviewActive(headers: Headers | { get(name: string): string | null }): boolean {
  return headers.get(PREVIEW_HEADER) === "1";
}
