"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { approveSessionRequest } from "@/app/studio/calendar/actions";
import { markSubscriptionPaid } from "@/app/studio/subscriptions/actions";

/**
 * Single-line action items the trainer can clear in one click.
 *
 * Two row shapes:
 *  - inline-action rows (mark paid / approve) keep their primary button
 *    on the right; the rest of the row links out for context
 *  - context rows (in-app upgrade, awaiting log, renewal, note) are
 *    just links — no visible secondary button competing with content;
 *    a `→` chevron appears on hover so the row reads as tappable
 */

export type FeedItem =
  | { kind: "pending_payment"; subscriptionId: string; clientId: string; clientName: string; packageName: string; priceUsd: number; createdAt: string }
  | { kind: "session_request"; sessionId: string; clientName: string; whenLabel: string }
  | { kind: "in_app_upgrade"; sessionId: string; clientName: string; whenLabel: string }
  | { kind: "awaiting_log"; sessionId: string; clientName: string; whenLabel: string }
  | { kind: "renewal_soon"; subscriptionId: string; clientId: string; clientName: string; packageName: string; daysLeft: number; sessionsLeft: number }
  | { kind: "client_note"; clientId: string; clientName: string; preview: string };

export function ActionFeed({ items }: { items: FeedItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function markPaid(subscriptionId: string) {
    startTransition(async () => {
      const r = await markSubscriptionPaid({ subscriptionId });
      if (!r.ok) alert(r.error);
      router.refresh();
    });
  }

  function approve(sessionId: string) {
    startTransition(async () => {
      const r = await approveSessionRequest(sessionId);
      if (!r.ok) alert(r.error);
      router.refresh();
    });
  }

  return (
    <ul className="divide-y divide-[color:var(--color-stone-soft)]/70">
      {items.map((item, i) => {
        if (item.kind === "pending_payment") {
          return (
            <li
              key={`pp-${item.subscriptionId}-${i}`}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <KindLabel tone="signal">payment due</KindLabel>
                <Link
                  href={`/studio/clients/${item.clientId}`}
                  className="min-w-0 flex-1 text-sm hover:text-[color:var(--color-moss-deep)]"
                >
                  <span className="font-medium">{item.clientName}</span>
                  <span className="text-[color:var(--color-ink)]/65">
                    {" "}owes ${item.priceUsd.toLocaleString()} for {item.packageName}
                  </span>
                </Link>
              </div>
              <button
                type="button"
                onClick={() => markPaid(item.subscriptionId)}
                disabled={pending}
                className="inline-flex h-11 shrink-0 items-center self-end rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)] disabled:opacity-60 sm:self-auto"
              >
                mark paid
              </button>
            </li>
          );
        }
        if (item.kind === "session_request") {
          return (
            <li
              key={`sr-${item.sessionId}-${i}`}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <Dot tone="signal" />
                <Link
                  href={`/studio/sessions/${item.sessionId}`}
                  className="min-w-0 flex-1 text-sm hover:text-[color:var(--color-moss-deep)]"
                >
                  <span className="font-medium">{item.clientName}</span>
                  <span className="text-[color:var(--color-ink)]/65">
                    {" "}requested a session — {item.whenLabel}
                  </span>
                </Link>
              </div>
              <button
                type="button"
                onClick={() => approve(item.sessionId)}
                disabled={pending}
                className="inline-flex h-11 shrink-0 items-center self-end rounded-full bg-[color:var(--color-ink)] px-4 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)] disabled:opacity-60 sm:self-auto"
              >
                approve
              </button>
            </li>
          );
        }
        if (item.kind === "awaiting_log") {
          return (
            <ContextRow
              key={`al-${item.sessionId}-${i}`}
              href={`/studio/sessions/${item.sessionId}`}
              tone="signal"
            >
              <span className="font-medium">{item.clientName}</span>
              <span className="text-[color:var(--color-ink)]/65">
                {" "}— {item.whenLabel} — log it before it&rsquo;s forgotten
              </span>
            </ContextRow>
          );
        }
        if (item.kind === "in_app_upgrade") {
          return (
            <ContextRow
              key={`up-${item.sessionId}-${i}`}
              href={`/studio/sessions/${item.sessionId}`}
              tone="signal"
            >
              <span className="font-medium">{item.clientName}</span>
              <span className="text-[color:var(--color-ink)]/65">
                {" "}requested an extra in-app workout — {item.whenLabel} (+$3)
              </span>
            </ContextRow>
          );
        }
        if (item.kind === "renewal_soon") {
          return (
            <ContextRow
              key={`rs-${item.subscriptionId}-${i}`}
              href={`/studio/clients/${item.clientId}`}
              kind="ending soon"
              tone="moss"
            >
              <span className="font-medium">{item.clientName}</span>
              <span className="text-[color:var(--color-ink)]/65">
                {" "}— {item.packageName} renews in {item.daysLeft}d ·{" "}
                {item.sessionsLeft} session{item.sessionsLeft === 1 ? "" : "s"} left
              </span>
            </ContextRow>
          );
        }
        if (item.kind === "client_note") {
          return (
            <ContextRow
              key={`cn-${item.clientId}-${i}`}
              href={`/studio/clients/${item.clientId}`}
              tone="moss"
            >
              <span className="font-medium">{item.clientName}</span>
              <span className="text-[color:var(--color-ink)]/65"> wrote: </span>
              <span className="italic text-[color:var(--color-ink)]/85">
                &ldquo;{item.preview}&rdquo;
              </span>
            </ContextRow>
          );
        }
        return null;
      })}
    </ul>
  );
}

function ContextRow({
  href,
  tone,
  kind,
  children,
}: {
  href: string;
  tone: "signal" | "moss";
  kind?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="group">
      <Link
        href={href}
        className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 text-sm transition-colors first:-mt-1 last:-mb-1 hover:bg-[color:var(--color-canvas)] sm:items-center"
      >
        {kind ? <KindLabel tone={tone}>{kind}</KindLabel> : <Dot tone={tone} />}
        {/* Mobile: wrap freely so the full action message stays
            readable. Desktop (sm+): dense one-line truncate so the
            list scans like an inbox. */}
        <span className="min-w-0 flex-1 break-words sm:truncate">{children}</span>
        <span
          aria-hidden
          className="hidden text-[color:var(--color-stone)] opacity-0 transition-opacity group-hover:opacity-100 sm:inline"
        >
          →
        </span>
      </Link>
    </li>
  );
}

function Dot({ tone }: { tone: "signal" | "moss" }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${
        tone === "signal"
          ? "bg-[color:var(--color-sienna)]"
          : "bg-[color:var(--color-moss)]"
      }`}
      aria-hidden
    />
  );
}

/**
 * Tiny eyebrow chip prefix that classifies what kind of action item
 * this is (e.g. "payment due", "ending soon"). Replaces the bare dot
 * for rows where the visual category matters at a glance — payment
 * vs renewal in particular were too close to read apart at speed.
 */
function KindLabel({
  tone,
  children,
}: {
  tone: "signal" | "moss";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        tone === "signal"
          ? "bg-[color:var(--color-sienna)]/15 text-[color:var(--color-sienna)]"
          : "bg-[color:var(--color-moss)]/15 text-[color:var(--color-moss-deep)]"
      }`}
    >
      {children}
    </span>
  );
}
