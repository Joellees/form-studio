import { redirect } from "next/navigation";

/**
 * The standalone calendar page is gone — its work moved into the
 * single-page portal at `/client`.
 */
export default function ClientCalendarRedirect() {
  redirect("/client");
}
