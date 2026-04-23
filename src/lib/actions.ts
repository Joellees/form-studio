import { z } from "zod";

/**
 * Typed result envelope for every Server Action. Lets call sites handle
 * failures without throwing, and keeps field-level errors structured.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data: data as T };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function failFromZod(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: "Check the highlighted fields.", fieldErrors };
}

/**
 * Parse and dispatch in one call. Keeps the happy path in the callback
 * and guarantees every action returns an ActionResult even if something
 * below throws.
 */
export async function runAction<S extends z.ZodTypeAny, T>(
  schema: S,
  raw: unknown,
  fn: (input: z.infer<S>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return failFromZod(parsed.error);
  try {
    return await fn(parsed.data);
  } catch (err) {
    console.error("[runAction] unexpected error", err);
    return fail("Something unexpected went wrong. Try again.");
  }
}
