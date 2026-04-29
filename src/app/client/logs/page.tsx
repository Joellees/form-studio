import { redirect } from "next/navigation";

/**
 * Standalone logs page is gone — cycle logging is folded into the
 * calendar header on the single-page portal at `/client`.
 */
export default function ClientLogsRedirect() {
  redirect("/client");
}
