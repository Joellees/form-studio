"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { seedUniversalLibrary } from "../actions";
import { Button } from "@/components/ui/button";

/**
 * Drops a one-time seed of common bodybuilding / strength /
 * powerlifting / crossfit / functional exercises into the trainer's
 * library. Idempotent on the server — safe to click again later if
 * new exercises get added to the universal list.
 */
export function ImportUniversalButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  function run() {
    startTransition(async () => {
      const result = await seedUniversalLibrary({});
      if (!result.ok) {
        alert(result.error);
        return;
      }
      const { groupsCreated, exercisesCreated, exercisesSkipped } = result.data;
      const parts: string[] = [];
      if (exercisesCreated > 0) parts.push(`${exercisesCreated} exercise${exercisesCreated === 1 ? "" : "s"} added`);
      if (groupsCreated > 0) parts.push(`${groupsCreated} group${groupsCreated === 1 ? "" : "s"} created`);
      if (exercisesSkipped > 0) parts.push(`${exercisesSkipped} skipped (already in library)`);
      alert(parts.length ? parts.join(" · ") : "Library is already up to date.");
      setConfirmed(false);
      router.refresh();
    });
  }

  if (!confirmed) {
    return (
      <Button variant="outline" size="md" onClick={() => setConfirmed(true)} disabled={pending}>
        import universal library
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="md" onClick={run} disabled={pending}>
        {pending ? "importing…" : "yes, import"}
      </Button>
      <Button variant="ghost" size="md" onClick={() => setConfirmed(false)} disabled={pending}>
        cancel
      </Button>
    </div>
  );
}
