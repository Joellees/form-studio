"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { generateAccessCode, hardDeleteAccessCode, previewNextAccessCode, revokeAccessCode } from "../actions";
import { formatBeta1Code, sanitizeBeta1Label } from "@/lib/access-codes";
import { KNOWN_COHORT_KEYS, cohortLabel } from "@/lib/cohorts";
import { getBetaGateUrl } from "@/lib/urls";

export type CodeRow = {
  id: string;
  code: string;
  cohort: string;
  label: string | null;
  revoked: boolean;
  redemptionCount: number;
  lastRedeemedAt: string | null;
  boundStudioId: string | null;
  boundTrainerName: string | null;
  createdAt: string | null;
  note: string | null;
};

type CodeStatus = "available" | "claimed" | "revoked";

function codeStatus(r: CodeRow): CodeStatus {
  if (r.revoked) return "revoked";
  if (r.redemptionCount > 0 || r.boundStudioId) return "claimed";
  return "available";
}

/**
 * WhatsApp handoff message — cohort-aware copy. The admin clicks "copy
 * WhatsApp message" and gets a ready-to-paste body with the right tone for
 * the trainer's cohort.
 *
 *   beta_1 (founders) — warm welcome, "free for life" line
 *   beta_2            — $29/mo or AED 109/mo, "price stays yours forever"
 *   other             — generic short fallback
 *
 * `name` is the personalized greeting target. Caller passes:
 *   - the bound trainer's `display_name` for already-claimed codes
 *   - the admin-typed `label` for freshly generated codes in the modal
 *   - `null` for unbound codes in the table where we have no name
 * When `name` is null we fall back to "Hey there".
 */
function whatsappMessage({
  cohort,
  code,
  name,
}: {
  cohort: string;
  code: string;
  name: string | null;
}): string {
  const greeting = name && name.trim() ? `Hey ${name.trim()}` : "Hey there";
  const url = getBetaGateUrl();

  if (cohort === "beta_1") {
    return [
      `${greeting} — welcome to Form Studio.`,
      ``,
      `So happy to have you from day one.`,
      ``,
      `Your access code: ${code}`,
      `Sign up here: ${url}`,
      ``,
      `Founders are free for life. No charge, no surprises. The studio is yours.`,
      ``,
      `Please tell me everything — what works, what doesn't, what's missing. All of it matters.`,
    ].join("\n");
  }

  if (cohort === "beta_2") {
    return [
      `${greeting} — welcome to Form Studio Beta 2. Thanks for trusting us this early.`,
      ``,
      `Your access code: ${code}`,
      `Sign up here: ${url}`,
      ``,
      `Your subscription is $29/month or AED 109/month — and this price stays yours forever, even after public launch.`,
      ``,
      `If you spot something or have an idea, the door's open.`,
    ].join("\n");
  }

  return `${greeting} — here's your Form Studio access code: ${code}. Use it to sign up at ${url}`;
}

export function CodesTable({ rows }: { rows: CodeRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CodeRow | null>(null);
  const [filter, setFilter] = useState<{ cohort: string; status: string; q: string }>({
    cohort: "all",
    status: "all",
    q: "",
  });
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    if (filter.cohort !== "all" && r.cohort !== filter.cohort) return false;
    const s = codeStatus(r);
    if (filter.status !== "all" && s !== filter.status) return false;
    if (filter.q) {
      const hay = `${r.code} ${r.label ?? ""} ${r.boundTrainerName ?? ""}`.toLowerCase();
      if (!hay.includes(filter.q.toLowerCase())) return false;
    }
    return true;
  });

  async function copy(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => setGenerating(true)}
          className="inline-flex h-10 items-center rounded-full bg-[color:var(--color-ink)] px-5 text-sm font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
        >
          generate access code
        </button>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            cohort
          </span>
          <select
            value={filter.cohort}
            onChange={(e) => setFilter({ ...filter, cohort: e.target.value })}
            className="select-pill h-9 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
          >
            <option value="all">all</option>
            {KNOWN_COHORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            status
          </span>
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            className="select-pill h-9 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
          >
            <option value="all">all</option>
            <option value="available">available</option>
            <option value="claimed">claimed</option>
            <option value="revoked">revoked</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            search
          </span>
          <input
            type="text"
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
            placeholder="label or code"
            className="h-9 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
          />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-[color:var(--color-canvas)] shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
            <tr className="border-b border-[color:var(--color-stone-soft)]">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Cohort</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Trainer</th>
              <th className="px-4 py-3 text-right">Redemptions</th>
              <th className="px-4 py-3">Last redeemed</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const status = codeStatus(r);
              return (
                <tr
                  key={r.id}
                  className="border-b border-[color:var(--color-stone-soft)]/60 last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs tabular-nums">{r.code}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-[color:var(--color-stone-soft)]/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ink)]/70">
                      {cohortLabel(r.cohort)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-ink)]/80">
                    {r.label ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                        status === "available"
                          ? "bg-[color:var(--color-moss)]/15 text-[color:var(--color-moss-deep)]"
                          : status === "claimed"
                            ? "bg-[color:var(--color-stone-soft)]/60 text-[color:var(--color-ink)]/65"
                            : "bg-[color:var(--color-sienna)]/15 text-[color:var(--color-sienna)]"
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.boundStudioId ? (
                      <Link
                        href={`/admin?q=${encodeURIComponent(r.boundTrainerName ?? "")}`}
                        className="hover:text-[color:var(--color-moss-deep)]"
                      >
                        {r.boundTrainerName ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-[color:var(--color-stone)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.redemptionCount}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-[color:var(--color-ink)]/55">
                    {r.lastRedeemedAt
                      ? new Date(r.lastRedeemedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="relative px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-ink)]/65 hover:bg-[color:var(--color-parchment)]"
                      aria-label="actions"
                    >
                      ⋯
                    </button>
                    {open === r.id ? (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setOpen(null)}
                        />
                        <div className="absolute right-4 top-full z-40 mt-1 w-64 rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] p-1.5 text-left shadow-[0_12px_32px_-8px_rgba(31,30,27,0.25)]">
                          <MenuItem onClick={() => copy(r.code, `c-${r.id}`)}>
                            {copied === `c-${r.id}` ? "copied" : "copy code"}
                          </MenuItem>
                          <MenuItem
                            onClick={() =>
                              copy(whatsappMessage({ cohort: r.cohort, code: r.code, name: r.boundTrainerName }), `w-${r.id}`)
                            }
                          >
                            {copied === `w-${r.id}`
                              ? "copied"
                              : "copy with WhatsApp message"}
                          </MenuItem>
                          {!r.revoked ? (
                            <MenuItem
                              danger
                              onClick={() => {
                                if (
                                  confirm(
                                    "Revoke this code? It can no longer be redeemed, including by the trainer who claimed it.",
                                  )
                                ) {
                                  // Run synchronously via the actions module
                                  void (async () => {
                                    const result = await revokeAccessCode({
                                      accessCodeId: r.id,
                                    });
                                    if (!result.ok) alert(result.error);
                                    setOpen(null);
                                    router.refresh();
                                  })();
                                }
                              }}
                            >
                              Revoke
                            </MenuItem>
                          ) : null}
                          {/* Hairline divider before the irreversible action. */}
                          <div className="my-1 h-px bg-[color:var(--color-stone-soft)]" aria-hidden />
                          <MenuItem
                            danger
                            onClick={() => {
                              setOpen(null);
                              setDeleteTarget(r);
                            }}
                          >
                            Permanently delete code
                          </MenuItem>
                        </div>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-[color:var(--color-stone)]"
                >
                  No codes match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {generating ? <GenerateCodeModal onClose={() => setGenerating(false)} /> : null}
      {deleteTarget ? (
        <HardDeleteCodeModal
          row={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
        danger
          ? "text-[color:var(--color-sienna)] hover:bg-[color:var(--color-sienna)]/10"
          : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
      }`}
    >
      {children}
    </button>
  );
}

// Cohorts that can be generated from the admin UI. Launch is
// intentionally excluded — it doesn't use codes. KNOWN_COHORT_KEYS
// is still used elsewhere (filtering, table display) but the
// generation modal only offers Beta 1 and Beta 2.
const GENERATABLE_COHORTS: Array<"beta_1" | "beta_2"> = ["beta_1", "beta_2"];

// ─── Hard-delete-code modal (irreversible) ───────────────────────
//
// Requires the admin to type the code value exactly. Cancel has
// autoFocus (default keyboard target). The server action re-checks
// the typed value inside the SQL function, and also refuses codes
// bound to an active trainer — that error surfaces inline here.

function HardDeleteCodeModal({
  row,
  onClose,
}: {
  row: CodeRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const matches = typed === row.code;
  // Surface the active-binding warning prominently. The server still has the
  // final word — a soft-deleted trainer's code is deletable but we can't tell
  // that from the client without an extra query, so we just warn on any
  // binding and let the server return a clear error if needed.
  const isBound = !!row.boundStudioId;

  function submit() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const r = await hardDeleteAccessCode({
        accessCodeId: row.id,
        confirmCode: typed,
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
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          Permanently delete code
        </h2>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl bg-[color:var(--color-sienna)]/10 px-4 py-3">
            <p className="font-mono text-base font-semibold tabular-nums">
              {row.code}
            </p>
            <p className="mt-1 text-xs text-[color:var(--color-ink)]/70">
              {cohortLabel(row.cohort)}
              {row.revoked ? " · revoked" : ""}
              {row.redemptionCount > 0
                ? ` · ${row.redemptionCount} redemption${row.redemptionCount === 1 ? "" : "s"}`
                : " · never redeemed"}
            </p>
            <p className="mt-1 text-xs text-[color:var(--color-ink)]/70">
              {isBound
                ? `Bound to: ${row.boundTrainerName ?? "(unknown trainer)"}`
                : "Not bound to any trainer"}
            </p>
          </div>

          <div className="text-sm text-[color:var(--color-ink)]/80 leading-relaxed">
            <p>
              This permanently removes the code row and every entry in the
              audit-log (`access_code_events`). The code can&apos;t be re-used,
              re-issued under the same value, or shown in history.
            </p>
            {isBound ? (
              <p className="mt-2 text-[color:var(--color-sienna)]">
                Heads-up: this code is bound to a trainer. If their account is
                still active, the server will refuse the delete (would orphan
                their access). Soft-deleted trainers&apos; codes are deletable.
              </p>
            ) : null}
            <p className="mt-2 text-[color:var(--color-sienna)]">
              There is no undo. Use Revoke if you only want to block redemption.
            </p>
          </div>

          <Field label={`type "${row.code}" to confirm`}>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={row.code}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              className="h-9 w-full rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm font-mono"
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
      </div>
    </div>
  );
}

// ─── tiny shared primitives ──────────────────────────────────────

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

function GenerateCodeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [cohort, setCohort] = useState<"beta_1" | "beta_2">("beta_1");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  /* Trial flag — beta_2 only. The checkbox is rendered conditionally
   * below the cohort select; toggling cohort to beta_1 resets the
   * flag so a B1 code never gets generated with trial_days set. */
  const [includeTrial, setIncludeTrial] = useState(false);
  const [pending, startTransition] = useTransition();
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Beta 2 preview ("B2-052") — fetched from server when cohort flips.
  // Beta 1 preview is computed client-side from the sanitized label.
  const [b2Preview, setB2Preview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Refresh Beta 2 preview whenever cohort flips to beta_2. Also
  // reset the trial flag whenever cohort changes — the trial option
  // is beta_2-only, but the checkbox state would otherwise persist
  // through a beta_2 → beta_1 → beta_2 toggle.
  useEffect(() => {
    if (cohort !== "beta_2") {
      setIncludeTrial(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void (async () => {
      const r = await previewNextAccessCode({ cohort: "beta_2" });
      if (cancelled) return;
      setPreviewLoading(false);
      setB2Preview(r.ok ? r.data.preview : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [cohort]);

  const b1Sanitized = cohort === "beta_1" ? sanitizeBeta1Label(label) : "";
  // Suffix lives in COHORT_CODE_FORMATS.beta_1.suffix — formatBeta1Code
  // reads from there so the preview stays in sync with the actual code
  // generated on submit.
  const b1Preview = b1Sanitized ? formatBeta1Code(b1Sanitized) : formatBeta1Code("{LABEL}");

  function submit() {
    if (cohort === "beta_1" && !b1Sanitized) {
      setError("Label is required and must contain at least one letter or digit.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await generateAccessCode({
        cohort,
        label: cohort === "beta_1" ? label.trim() : undefined,
        note: note.trim() || undefined,
        /* Trial is beta_2-only and 7 days is the only length the UI
         * offers today. The server-side schema also gates trial_days
         * to beta_2 — sending it on a beta_1 generation would be
         * silently ignored. */
        trial_days: cohort === "beta_2" && includeTrial ? 7 : undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setGenerated(r.data.code);
      router.refresh();
    });
  }

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
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          {generated ? "Code generated" : "New access code"}
        </h2>

        {generated ? (
          <div className="mt-5 space-y-4">
            <p className="rounded-2xl bg-[color:var(--color-parchment)] px-4 py-3 font-mono text-base tabular-nums">
              {generated}
            </p>
            {/* WhatsApp message preview — read-only, multi-line, copy via button below. */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                WhatsApp message
              </p>
              <textarea
                readOnly
                value={whatsappMessage({ cohort, code: generated, name: label || null })}
                rows={9}
                className="w-full resize-none rounded-2xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 py-3 text-xs leading-relaxed text-[color:var(--color-ink)]/85"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    // Fresh code is unbound by definition — but the admin
                    // just typed `label` for this specific person, so use it
                    // as the personalization target.
                    whatsappMessage({ cohort, code: generated, name: label || null }),
                  )
                }
                className="inline-flex h-10 items-center justify-center rounded-full bg-[color:var(--color-ink)] px-4 text-sm font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)]"
              >
                copy WhatsApp message
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(generated)}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--color-ink)]/15 bg-[color:var(--color-canvas)] px-4 text-sm font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-parchment)]"
              >
                copy code only
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-[color:var(--color-stone)] hover:text-[color:var(--color-moss-deep)]"
              >
                done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                cohort
              </span>
              <select
                value={cohort}
                onChange={(e) => setCohort(e.target.value as "beta_1" | "beta_2")}
                className="select-pill h-10 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
              >
                {GENERATABLE_COHORTS.map((k) => (
                  <option key={k} value={k}>
                    {cohortLabel(k)}
                  </option>
                ))}
              </select>
            </div>

            {cohort === "beta_1" ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                  label
                </span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Joelle"
                  autoFocus
                  className="h-10 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
                />
                <p className="text-[11px] text-[color:var(--color-stone)]">
                  Spaces and special chars are stripped. Preview:{" "}
                  <span className="font-mono tabular-nums">{b1Preview}</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                  next code
                </span>
                <div className="h-10 rounded-full bg-[color:var(--color-parchment)] px-4 text-sm leading-10 font-mono tabular-nums">
                  {previewLoading ? "…" : b2Preview ?? "B2-???"}
                </div>
                <p className="text-[11px] text-[color:var(--color-stone)]">
                  Numbers increment forever; revoked codes never free up their number.
                </p>
                {/* Trial flag — Beta 2 only. Checked = generated code
                  * carries trial_days = 7 and the redeeming trainer
                  * gets full studio access for 7 days before the
                  * /studio/expired gate kicks in. Unchecked = normal
                  * Beta 2 behaviour (lands on /studio/expired
                  * immediately to subscribe). */}
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-[color:var(--color-ink)]">
                  <input
                    type="checkbox"
                    checked={includeTrial}
                    onChange={(e) => setIncludeTrial(e.target.checked)}
                    className="h-4 w-4 rounded border-[color:var(--color-stone-soft)] text-[color:var(--color-ink)] focus:ring-2 focus:ring-[color:var(--color-ink)]/15"
                  />
                  <span>Include 7-day trial</span>
                </label>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                internal note (optional)
              </span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Met at Dubai Fitness Challenge 2026"
                className="h-10 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
              />
            </div>
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
                {pending ? "generating…" : "generate"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
