import { redirect } from "next/navigation";

// Workouts moved under /studio/library?tab=workouts. Keep this redirect
// so any old bookmarks or in-app links land in the right place.
export default function TemplatesPageRedirect() {
  redirect("/studio/library?tab=workouts");
}
