"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { generateAccessCode, revokeAccessCode } from "../actions";
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

function whatsappMessage(label: string | null, code: string): string {
  const name = label ?? "there";
  return `Hi ${name}, here's your Form Studio access code: ${code}. Use it to sign up at ${getBetaGateUrl()}`;
}

export function CodesTable({ rows }: { rows: CodeRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
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
                              copy(whatsappMessage(r.label, r.code), `w-${r.id}`)
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

function GenerateCodeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [cohort, setCohort] = useState<string>(KNOWN_COHORT_KEYS[0] ?? "beta_2");
  const [custom, setCustom] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const target = cohort === "__custom" ? custom.trim() : cohort;
    if (!target) {
      setError("Pick a cohort or type a custom one.");
      return;
    }
    if (!label.trim()) {
      setError("Label is required (used in the code).");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await generateAccessCode({
        cohort: target,
        label: label.trim(),
        note: note.trim() || undefined,
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
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    whatsappMessage(label || null, generated),
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
                onChange={(e) => setCohort(e.target.value)}
                className="select-pill h-10 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
              >
                {KNOWN_COHORT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
                <option value="__custom">+ type a custom cohort</option>
              </select>
            </div>
            {cohort === "__custom" ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                  custom cohort key
                </span>
                <input
                  type="text"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="e.g. beta_3"
                  className="h-10 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
                label
              </span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Sarah Khalil"
                className="h-10 rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-4 text-sm"
              />
              <p className="text-[11px] text-[color:var(--color-stone)]">
                Used in the generated code, e.g. SARAH-BETA2-X4K2
              </p>
            </div>
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
