"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Minimal toast primitive — no new dependencies, just a context + a
 * fixed-position host. Reserves the z-60 slot from `globals.css`.
 *
 * Use it where a silent failure used to live:
 *
 *   const toast = useToast();
 *   const r = await someServerAction(...);
 *   if (!r.ok) toast.error(r.error);
 *
 * The host is portaled to `document.body` so it escapes any
 * containing block (backdrop-blur on the sticky header, overflow-clip
 * on `<main>`, etc.).
 */

type ToastKind = "success" | "error" | "info";
type Toast = { id: string; kind: ToastKind; message: string; createdAt: number };

const DEFAULT_DURATION_MS = 5000;

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  push: (kind: ToastKind, message: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setMounted(true);
    return () => {
      // Clean up any pending auto-dismiss timers on unmount.
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, kind, message, createdAt: Date.now() }]);
      const timer = window.setTimeout(() => dismiss(id), DEFAULT_DURATION_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api: ToastApi = useMemo(
    () => ({
      push,
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {mounted
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
              }}
              role="region"
              aria-label="notifications"
              aria-live="polite"
            >
              {toasts.map((t) => (
                <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Allow components outside a provider to no-op rather than crash —
    // every page in the studio + client surfaces has the provider, but
    // server components / tests calling through transitively should
    // still degrade gracefully.
    return {
      push: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const colors =
    toast.kind === "error"
      ? "bg-[color:var(--color-sienna)] text-[color:var(--color-canvas)]"
      : toast.kind === "success"
        ? "bg-[color:var(--color-moss-deep)] text-[color:var(--color-canvas)]"
        : "bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]";

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-[0_12px_32px_-8px_rgba(31,30,27,0.45)] ${colors}`}
    >
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="dismiss"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-canvas)]/70 hover:text-[color:var(--color-canvas)]"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M3 3l6 6M9 3l-6 6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
