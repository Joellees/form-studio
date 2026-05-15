"use client";

import { useEffect, useState } from "react";

import {
  LibrarySidebar,
  type LibrarySidebarExercise,
  type LibrarySidebarGroup,
  type LibrarySidebarWorkout,
} from "./library-sidebar";

/**
 * Mobile-aware wrapper around `LibrarySidebar`. On desktop (lg+) the
 * sidebar lives inline as a sticky aside, exactly like before. On
 * phones it collapses behind a floating action button — tap to open
 * a bottom-sheet drawer with the same picker, tap an "add" to attach
 * an exercise to the workout/session, then tap outside to dismiss.
 *
 * Workouts and sessions (the two surfaces with a builder) both wrap
 * their library picker in this so the layout is consistent and the
 * mobile experience doesn't make the trainer scroll past the workout
 * to reach the library.
 */
export function LibraryDock(props: {
  exercises: LibrarySidebarExercise[];
  groups: LibrarySidebarGroup[];
  workouts?: LibrarySidebarWorkout[];
  onAdd: (exerciseId: string) => void;
  onApplyWorkout?: (workoutId: string) => void;
  onCreate?: (input: { name: string; groupId: string | null }) => Promise<string | null>;
  pending?: boolean;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open — phones get janky if
  // both the sheet and the page scroll at once.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape — easy keyboard exit on tablet/desktop while the
  // sheet is also reachable via the FAB on phones.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Desktop: inline sticky aside */}
      <aside className="sticky top-24 hidden h-fit lg:block">
        <LibrarySidebar {...props} />
      </aside>

      {/* Mobile: floating action button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="open library"
        className="fixed bottom-6 right-5 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-[color:var(--color-ink)] px-5 text-sm font-medium text-[color:var(--color-canvas)] shadow-[0_12px_32px_-8px_rgba(31,30,27,0.45)] transition-transform hover:scale-[1.02] active:scale-[0.98] lg:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path
            d="M9 3v12M3 9h12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        library
      </button>

      {/* Mobile bottom-sheet */}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-[color:var(--color-ink)]/40 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[80vh] w-full flex-col rounded-t-3xl bg-[color:var(--color-canvas)] shadow-[0_-12px_32px_-8px_rgba(31,30,27,0.35)]"
          >
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight">library</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)]"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <LibrarySidebar {...props} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
