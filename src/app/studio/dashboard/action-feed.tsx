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
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Dot tone="signal" />
              <Link
                href={`/studio/clients/${item.clientId}`}
                className="min-w-0 flex-1 text-sm hover:text-[color:var(--color-moss-deep)]"
              >
                <span className="font-medium">{item.clientName}</span>
                <span className="text-[color:var(--color-ink)]/65">
                  {" "}owes ${item.priceUsd.toLocaleString()} for {item.packageName}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => markPaid(item.subscriptionId)}
                disabled={pending}
                className="inline-flex h-8 items-center rounded-full bg-[color:var(--color-ink)] px-3.5 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)] disabled:opacity-60"
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
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
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
              <button
                type="button"
                onClick={() => approve(item.sessionId)}
                disabled={pending}
                className="inline-flex h-8 items-center rounded-full bg-[color:var(--color-ink)] px-3.5 text-xs font-medium text-[color:var(--color-canvas)] hover:bg-[color:var(--color-moss-deep)] disabled:opacity-60"
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
  children,
}: {
  href: string;
  tone: "signal" | "moss";
  children: React.ReactNode;
}) {
  return (
    <li className="group">
      <Link
        href={href}
        className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 text-sm transition-colors first:-mt-1 last:-mb-1 hover:bg-[color:var(--color-canvas)]"
      >
        <Dot tone={tone} />
        <span className="min-w-0 flex-1 truncate">{children}</span>
        <span
          aria-hidden
          className="text-[color:var(--color-stone)] opacity-0 transition-opacity group-hover:opacity-100"
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
