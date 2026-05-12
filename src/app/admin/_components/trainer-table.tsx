"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cancelTrainerSubscription,
  changeCohort,
  grantFounding,
  hardDeleteTrainer,
  markTrainerPaid,
  reactivateTrainerSubscription,
  restoreStudio,
  softDeleteStudio,
} from "../actions";
import { KNOWN_COHORT_KEYS } from "@/lib/cohorts";
import { PRICING, formatPrice, isPricedCohort } from "@/lib/pricing";

export type TrainerRow = {
  id: string;
  displayName: string;
  email: string | null;
  subdomainSlug: string | null;
  cohort: string | null;
  cohortDisplay: string;
  status: string | null;
  cadence: string | null;
  currency: string | null;
  priceDisplay: string | null;
  paidUntil: string | null;
  lastMarkedPaidAt: string | null;
  joinedAt: string | null;
  softDeleted: boolean;
};

export function AdminTrainerTable({ rows }: { rows: TrainerRow[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | null
    | { kind: "mark_paid"; row: TrainerRow }
    | { kind: "change_cohort"; row: TrainerRow }
    | { kind: "hard_delete"; row: TrainerRow }
  >(null);

  if (rows.length === 0) {
    return (
      <p className="mt-8 text-sm text-[color:var(--color-stone)]">
        No trainers match these filters.
      </p>
    );
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl bg-[color:var(--color-canvas)] shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="text-left">
          <tr className="border-b border-[color:var(--color-stone-soft)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            <th className="px-4 py-3">Trainer</th>
            <th className="px-4 py-3">Cohort</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Plan</th>
            <th className="px-4 py-3">Paid until</th>
            <th className="px-4 py-3">Last paid</th>
            <th className="px-4 py-3">Joined</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[color:var(--color-stone-soft)]/60 last:border-0"
            >
              <td className="px-4 py-3">
                <p className="font-medium">
                  {r.displayName}
                  {r.softDeleted ? (
                    <span className="ml-2 rounded-full bg-[color:var(--color-stone-soft)]/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink)]/65">
                      soft-deleted
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[color:var(--color-ink)]/55">
                  {r.email ?? "—"}
                </p>
              </td>
              <td className="px-4 py-3">
                <Pill tone="stone">{r.cohortDisplay}</Pill>
              </td>
              <td className="px-4 py-3">
                <StatusPill status={r.status} />
              </td>
              <td className="px-4 py-3 tabular-nums">
                {r.cadence && r.currency ? (
                  <>
                    <p>{r.priceDisplay ?? "—"}</p>
                    <p className="text-xs text-[color:var(--color-ink)]/55">
                      {r.cadence}
                    </p>
                  </>
                ) : (
                  <p className="text-[color:var(--color-stone)]">—</p>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">
                <PaidUntilCell value={r.paidUntil} />
              </td>
              <td className="px-4 py-3 tabular-nums text-xs">
                {r.lastMarkedPaidAt
                  ? new Date(r.lastMarkedPaidAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </td>
              <td className="px-4 py-3 tabular-nums text-xs">
                {r.joinedAt
                  ? new Date(r.joinedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <RowMenu
                  row={r}
                  open={activeId === r.id}
                  onOpen={() => setActiveId(r.id)}
                  onClose={() => setActiveId(null)}
                  onModal={(kind) => {
                    setActiveId(null);
                    setModal({ kind, row: r });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal?.kind === "mark_paid" ? (
        <MarkPaidModal row={modal.row} onClose={() => setModal(null)} />
      ) : null}
      {modal?.kind === "change_cohort" ? (
        <ChangeCohortModal row={modal.row} onClose={() => setModal(null)} />
      ) : null}
      {modal?.kind === "hard_delete" ? (
        <HardDeleteModal row={modal.row} onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "stone" | "moss" | "signal" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "moss"
      ? "bg-[color:var(--color-moss)]/15 text-[color:var(--color-moss-deep)]"
      : tone === "signal"
        ? "bg-[color:var(--color-sienna)]/15 text-[color:var(--color-sienna)]"
        : tone === "muted"
          ? "bg-[color:var(--color-stone-soft)]/50 text-[color:var(--color-ink)]/60"
          : "bg-[color:var(--color-stone-soft)]/60 text-[color:var(--color-ink)]/70";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${cls}`}
    >
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (status === "founding") return <Pill tone="moss">Founding</Pill>;
  if (status === "active") return <Pill tone="moss">Active</Pill>;
  if (status === "expired") return <Pill tone="signal">Expired</Pill>;
  if (status === "canceled") return <Pill tone="muted">Canceled</Pill>;
  return <Pill tone="stone">{status ?? "—"}</Pill>;
}

function PaidUntilCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-[color:var(--color-stone)]">—</span>;
  const expiry = new Date(value);
  const days = Math.round((expiry.getTime() - Date.now()) / 86400_000);
  const fmt = expiry.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const rel =
    days > 0
      ? `in ${days}d`
      : days === 0
        ? "today"
        : `${Math.abs(days)}d ago`;
  return (
    <>
      <p>{fmt}</p>
      <p className="text-xs text-[color:var(--color-ink)]/55">{rel}</p>
    </>
  );
}

function RowMenu({
  row,
  open,
  onOpen,
  onClose,
  onModal,
}: {
  row: TrainerRow;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onModal: (kind: "mark_paid" | "change_cohort" | "hard_delete") => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await action();
      if (!r.ok) alert(r.error ?? "Action failed");
      onClose();
      router.refresh();
    });
  }

  const canMarkPaid =
    !row.softDeleted && row.cohort && isPricedCohort(row.cohort) && row.status !== "founding";

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink)]/65 hover:bg-[color:var(--color-parchment)]"
        aria-label="actions"
      >
        ⋯
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
          <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] p-1.5 shadow-[0_12px_32px_-8px_rgba(31,30,27,0.25)]">
            {canMarkPaid ? (
              <MenuItem onClick={() => onModal("mark_paid")}>Mark paid</MenuItem>
            ) : null}
            <MenuItem onClick={() => onModal("change_cohort")}>Change cohort</MenuItem>
            {row.status === "founding" ? null : (
              <MenuItem
                onClick={() =>
                  confirm(`Grant founding status to ${row.displayName}? Free for life.`) &&
                  run(() => grantFounding({ studioId: row.id }))
                }
                disabled={pending}
              >
                Grant founding
              </MenuItem>
            )}
            {row.status === "canceled" ? (
              <MenuItem
                onClick={() => run(() => reactivateTrainerSubscription({ studioId: row.id }))}
                disabled={pending}
              >
                Reactivate
              </MenuItem>
            ) : row.status !== "founding" ? (
              <MenuItem
                danger
                onClick={() =>
                  confirm(`Cancel subscription for ${row.displayName}?`) &&
                  run(() => cancelTrainerSubscription({ studioId: row.id }))
                }
                disabled={pending}
              >
                Cancel subscription
              </MenuItem>
            ) : null}
            {row.softDeleted ? (
              <MenuItem
                onClick={() => run(() => restoreStudio({ studioId: row.id }))}
                disabled={pending}
              >
                Restore studio
              </MenuItem>
            ) : (
              <MenuItem
                danger
                onClick={() =>
                  confirm(
                    `Soft-delete ${row.displayName}? Their access is blocked but every record (clients, sessions, packages) is preserved. Reversible.`,
                  ) && run(() => softDeleteStudio({ studioId: row.id }))
                }
                disabled={pending}
              >
                Soft-delete
              </MenuItem>
            )}
            {/* Visual divider between reversible actions and the irreversible one. */}
            <div className="my-1 h-px bg-[color:var(--color-stone-soft)]" aria-hidden />
            <MenuItem danger onClick={() => onModal("hard_delete")}>
              Permanently delete trainer
            </MenuItem>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
        danger
          ? "text-[color:var(--color-sienna)] hover:bg-[color:var(--color-sienna)]/10"
          : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Mark Paid modal ─────────────────────────────────────────────

function MarkPaidModal({
  row,
  onClose,
}: {
  row: TrainerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cadence, setCadence] = useState<"monthly" | "annual">(
    (row.cadence as "monthly" | "annual") ?? "monthly",
  );
  const [currency, setCurrency] = useState<"usd" | "aed" | "sar">(
    (row.currency as "usd" | "aed" | "sar") ?? "usd",
  );
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cohort = (row.cohort as keyof typeof PRICING) ?? "beta_2";
  const amount =
    cohort in PRICING ? PRICING[cohort as keyof typeof PRICING][cadence][currency] : null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await markTrainerPaid({
        studioId: row.id,
        cadence,
        currency,
        note: note.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} title={`Mark paid · ${row.displayName}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="cadence">
            <Select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as "monthly" | "annual")}
            >
              <option value="monthly">monthly</option>
              <option value="annual">annual</option>
            </Select>
          </Field>
          <Field label="currency">
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "usd" | "aed" | "sar")}
            >
              <option value="usd">USD</option>
              <option value="aed">AED</option>
              <option value="sar">SAR</option>
            </Select>
          </Field>
        </div>
        <Field label="amount">
          <div className="rounded-full bg-[color:var(--color-parchment)] px-4 py-2 text-base font-semibold tabular-nums">
            {amount !== null ? formatPrice(amount, currency) : "—"}
          </div>
        </Field>
        <Field label="note (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Whish tx #ABC123 received 2026-05-13"
            className="h-9 w-full rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
          />
        </Field>
        {error ? (
          <p className="text-xs text-[color:var(--color-sienna)]">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-full px-4 text-xs text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)]"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)] disabled:opacity-60"
          >
            {pending ? "marking…" : "confirm marked paid"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Change cohort modal ─────────────────────────────────────────

function ChangeCohortModal({
  row,
  onClose,
}: {
  row: TrainerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [newCohort, setNewCohort] = useState(row.cohort ?? "beta_2");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const target = newCohort === "__custom" ? custom.trim() : newCohort;
    if (!target) {
      setError("Pick a cohort or type a custom one.");
      return;
    }
    startTransition(async () => {
      const r = await changeCohort({
        studioId: row.id,
        newCohort: target,
        note: note.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} title={`Change cohort · ${row.displayName}`}>
      <div className="space-y-4">
        <p className="text-xs text-[color:var(--color-ink)]/65">
          Current cohort: <span className="font-semibold">{row.cohortDisplay}</span>
        </p>
        <Field label="new cohort">
          <Select
            value={newCohort}
            onChange={(e) => setNewCohort(e.target.value)}
          >
            {KNOWN_COHORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
            <option value="__custom">+ type a custom cohort</option>
          </Select>
        </Field>
        {newCohort === "__custom" ? (
          <Field label="custom cohort key">
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. beta_3, partner_2026"
              className="h-9 w-full rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
            />
          </Field>
        ) : null}
        <p className="rounded-xl bg-[color:var(--color-sienna)]/10 px-3 py-2 text-xs text-[color:var(--color-sienna)]">
          ⚠ Changing cohort doesn&rsquo;t automatically change status, pricing,
          or paid_until. Adjust those separately if needed.
        </p>
        <Field label="reason (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-9 w-full rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
          />
        </Field>
        {error ? (
          <p className="text-xs text-[color:var(--color-sienna)]">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-full px-4 text-xs text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)]"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)] disabled:opacity-60"
          >
            {pending ? "saving…" : "change cohort"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Hard-delete modal (irreversible) ────────────────────────────
//
// Requires the admin to type the trainer's display_name exactly before
// the destroy button enables. Cancel is the default focused control.
// The server action also re-checks the typed name inside the SQL
// function — the client-side gate is UX, not security.

function HardDeleteModal({
  row,
  onClose,
}: {
  row: TrainerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const matches = typed === row.displayName;

  function submit() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const r = await hardDeleteTrainer({
        studioId: row.id,
        confirmDisplayName: typed,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} title="Permanently delete trainer">
      <div className="space-y-4">
        <div className="rounded-2xl bg-[color:var(--color-sienna)]/10 px-4 py-3">
          <p className="text-[15px] font-semibold tracking-tight text-[color:var(--color-ink)]">
            {row.displayName}
          </p>
          <p className="text-xs text-[color:var(--color-ink)]/65">
            {row.email ?? "—"}
            {row.subdomainSlug ? ` · /s/${row.subdomainSlug}` : null}
          </p>
        </div>

        <div className="text-sm text-[color:var(--color-ink)]/80 leading-relaxed">
          <p>
            This permanently deletes every record owned by this trainer:
            clients, sessions, packages, exercises, templates, subscriptions,
            and all related audit logs. The access codes themselves are
            preserved (their bindings are cleared so they can be reissued).
          </p>
          <p className="mt-2">
            The trainer&rsquo;s Clerk account is also deleted, so the same
            email can be re-used to sign up again.
          </p>
          <p className="mt-2 text-[color:var(--color-sienna)]">
            There is no undo. Use Soft-delete if you might want them back.
          </p>
        </div>

        <Field label={`type "${row.displayName}" to confirm`}>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={row.displayName}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            className="h-9 w-full rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
          />
        </Field>

        <p className="text-[11px] italic text-[color:var(--color-ink)]/55">
          Note: Uploaded files in storage are not deleted by this action.
        </p>

        {error ? (
          <p className="text-xs text-[color:var(--color-sienna)]">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            autoFocus
            className="inline-flex h-9 items-center rounded-full px-4 text-xs text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)] disabled:opacity-60"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!matches || pending}
            className="inline-flex h-9 items-center rounded-full bg-[color:var(--color-sienna)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "deleting…" : "Permanently delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── tiny shared primitives ─────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 p-0 md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-[color:var(--color-canvas)] p-5 pb-7 shadow-[0_24px_64px_-12px_rgba(31,30,27,0.35)] md:rounded-3xl md:p-6 md:pb-6"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
          admin
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="select-pill h-9 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
    />
  );
}

// silence unused-import warning if Link/_ ever gets used in future iterations
void Link;
