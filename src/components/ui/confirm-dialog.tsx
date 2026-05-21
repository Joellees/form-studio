"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

/**
 * Branded replacement for `window.confirm` and `window.alert`.
 *
 * Why this exists:
 *   - The OS-native confirm/alert dialogs look like a 90s desktop
 *     popup — square corners, cramped buttons, white-on-white. On iOS
 *     Safari they cover the URL bar with a permanent banner. Neither
 *     respects our voice ("lowercase-comfortable, editorial") or the
 *     warm canvas/parchment palette.
 *   - Native confirm uses a synchronous prompt that blocks the JS
 *     thread, so toasts queued before it never paint. Lots of mutations
 *     in this app run a `toast.success(...)` right after a confirm, and
 *     on native confirm the toast stack stutters.
 *
 * Shape:
 *   - Single context provider at the root layout owns one dialog
 *     instance. Components call `useConfirm()` to get an async
 *     function returning `Promise<boolean>`. That preserves the linear
 *     `if (!(await confirm(...))) return` pattern at the call site, so
 *     existing logic ports over with a minimal diff.
 *   - Built on Radix Dialog (already in package.json) for focus trap,
 *     escape-to-close, click-outside-to-close, and ARIA semantics for
 *     free. We only style.
 *   - `tone: "danger"` paints the confirm button sienna and the
 *     eyebrow with the same. Default tone uses ink primary.
 *
 * Voice rules (from CLAUDE.md):
 *   - lowercase question titles
 *   - no exclamation marks
 *   - body line gives consequence, not preamble
 *     (good: "you can restore them anytime."
 *      bad:  "Are you sure you want to do this?")
 */

export type ConfirmOptions = {
  /** Lowercase question — e.g. "remove this exercise from the workout?" */
  title: string;
  /** Optional clarifying line under the title. Sentence case. */
  body?: string;
  /** Confirm button label. Defaults to "confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "cancel". */
  cancelLabel?: string;
  /** Visual treatment. `danger` for destructive actions (delete, cancel, archive). */
  tone?: "default" | "danger";
};

type PendingRequest = ConfirmOptions & { resolve: (v: boolean) => void };

const ConfirmCtx = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  /* Guard against double-resolve: if the user spam-taps confirm/cancel
   * we still resolve exactly once. */
  const resolvedRef = useRef(false);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolvedRef.current = false;
      setPending({ ...opts, resolve });
    });
  }, []);

  function close(result: boolean) {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    pending?.resolve(result);
    setPending(null);
  }

  /* Radix dialog open state is controlled — `open` is true only while
   * we have a pending request, and the onOpenChange handler bridges
   * any close path (escape, click-outside, X button) into a cancel. */
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog.Root
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[color:var(--color-ink)]/30 backdrop-blur-sm dialog-overlay-in" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-[color:var(--color-canvas)] p-7 shadow-[0_24px_64px_-16px_rgba(31,30,27,0.35)] focus:outline-none dialog-content-in"
            onOpenAutoFocus={(e) => {
              /* Don't pre-focus inside the dialog — letting the
               * destructive button auto-focus on a 'danger' confirm
               * makes a fat-finger Enter destroy the row. Focus the
               * dialog container instead so Escape still works. */
              e.preventDefault();
              const root = e.currentTarget as HTMLElement | null;
              root?.focus();
            }}
            tabIndex={-1}
          >
            {pending ? (
              <>
                <Dialog.Title asChild>
                  <h2 className="text-[18px] font-semibold leading-snug tracking-tight text-[color:var(--color-ink)]">
                    {pending.title}
                  </h2>
                </Dialog.Title>
                {pending.body ? (
                  <Dialog.Description asChild>
                    <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink)]/70">
                      {pending.body}
                    </p>
                  </Dialog.Description>
                ) : (
                  // Radix complains in dev if Description is omitted entirely.
                  <Dialog.Description className="sr-only">
                    {pending.title}
                  </Dialog.Description>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => close(false)}
                    type="button"
                  >
                    {pending.cancelLabel ?? "cancel"}
                  </Button>
                  <Button
                    variant={pending.tone === "danger" ? "danger" : "primary"}
                    onClick={() => close(true)}
                    type="button"
                  >
                    {pending.confirmLabel ?? "confirm"}
                  </Button>
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmCtx.Provider>
  );
}

/**
 * Pop a branded confirm dialog. Returns a promise that resolves
 * `true` if the user clicked the confirm button, `false` for any
 * cancel path (button, Escape, click-outside).
 *
 * Outside a provider this is a no-op that resolves false — server
 * components and tests that don't wrap with the provider get a safe
 * default rather than a crash.
 */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmCtx);
  return useMemo(() => {
    if (ctx) return ctx;
    return async () => false;
  }, [ctx]);
}
