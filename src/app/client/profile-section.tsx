"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateNoteToTrainer } from "./actions";
import { SwitchPackageNextCycle } from "./dashboard/switch-package";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

type Package = {
  id: string;
  name: string;
  session_count: number;
  price_usd: number;
};

type Props = {
  displayName: string;
  trainerName: string;
  noteToTrainer: string | null;
  active: {
    subscriptionId: string;
    packageId: string;
    packageName: string;
    sessionsRemaining: number;
    sessionCount: number;
    pendingPackageId: string | null;
    nextRenewal: string | null;
  } | null;
  pending: {
    subscriptionId: string;
    packageName: string;
    sessionCount: number;
  } | null;
  packages: Package[];
};

/**
 * Compact profile strip at the top of the client portal. Shows name +
 * package + note-to-trainer in three short lanes; everything else
 * (request session, cancel, log cycle) lives inside the calendar.
 */
export function ProfileSection({
  displayName,
  trainerName,
  noteToTrainer,
  active,
  pending,
  packages,
}: Props) {
  const router = useRouter();
  const [savingNote, startNoteSave] = useTransition();
  const [note, setNote] = useState(noteToTrainer ?? "");
  const [editing, setEditing] = useState(false);

  function saveNote() {
    startNoteSave(async () => {
      const result = await updateNoteToTrainer({ note: note.trim() || null });
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-3xl bg-[color:var(--color-parchment)]/70 px-6 py-5 shadow-[var(--shadow-card)] md:px-8 md:py-6">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              {trainerName}&rsquo;s studio
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              {displayName}
            </h1>
          </div>

          {active ? (
            <div className="rounded-2xl bg-[color:var(--color-canvas)] px-4 py-3">
              <SwitchPackageNextCycle
                subscriptionId={active.subscriptionId}
                currentPackageId={active.packageId}
                pendingPackageId={active.pendingPackageId}
                packages={packages}
                nextRenewal={active.nextRenewal}
              />
              <p className="mt-2 text-xs text-[color:var(--color-stone)] tabular-nums">
                {active.packageName} · {active.sessionsRemaining} session
                {active.sessionsRemaining === 1 ? "" : "s"} left this month
              </p>
            </div>
          ) : pending ? (
            // Pending packages render with the same shape as active —
            // the client has full access regardless of payment status
            // (Beta 2 spec). The "payment pending" line is a single
            // quiet informational note; it never gates anything.
            <div className="rounded-2xl bg-[color:var(--color-canvas)] px-4 py-3">
              <p className="text-sm font-medium tracking-tight">
                {pending.packageName}
              </p>
              <p className="mt-1 text-xs text-[color:var(--color-stone)] tabular-nums">
                {pending.sessionCount} session
                {pending.sessionCount === 1 ? "" : "s"} per month
              </p>
              <p className="mt-2 text-xs text-[color:var(--color-ink)]/55">
                Payment pending with {trainerName}. They&rsquo;ll mark it as
                received once it&rsquo;s settled.
              </p>
            </div>
          ) : (
            <p className="rounded-2xl bg-[color:var(--color-canvas)] px-4 py-3 text-sm text-[color:var(--color-ink)]/75">
              No active package. Ask {trainerName} for an invite when you&rsquo;re ready.
            </p>
          )}
        </div>

        <div className="md:w-[280px] md:max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            note to {trainerName}
          </p>
          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What do you want them to know?"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={saveNote} disabled={savingNote}>
                  {savingNote ? "saving…" : "save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={savingNote}
                  onClick={() => {
                    setEditing(false);
                    setNote(noteToTrainer ?? "");
                  }}
                >
                  cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-2 block w-full rounded-2xl bg-[color:var(--color-canvas)] px-4 py-3 text-left text-sm text-[color:var(--color-ink)]/85 transition-colors hover:bg-[color:var(--color-canvas)]/80"
            >
              {note ? note : (
                <span className="text-[color:var(--color-stone)]">
                  Tap to write a note for your trainer.
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
