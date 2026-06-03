"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  approveSessionRequest,
  cancelSession,
  declineSessionRequest,
} from "@/app/studio/calendar/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Session = { id: string; status: string };

/**
 * Action buttons on the session-detail page.
 *
 * Three lifecycle branches:
 *   - status='requested'  → approve / decline
 *   - status='scheduled'  → cancel session (with confirm)
 *   - everything else     → no actions surfaced
 *
 * Action wiring honours the same boundary the requests panel uses
 * at the top of the calendar:
 *   - approve  → approveSessionRequest (flips 'requested' →
 *                'scheduled', decrements the client's subscription
 *                count for non-in-app types)
 *   - decline  → declineSessionRequest (flips 'requested' →
 *                'declined'). Previously this surface called
 *                cancelSession with reason='declined', which set the
 *                terminal status to 'cancelled' instead — the same
 *                trainer click was producing two different statuses
 *                depending on which screen the trainer used. Fixed
 *                by routing both surfaces through the same action.
 *   - cancel   → cancelSession (already-scheduled sessions; credits
 *                the client's package).
 *
 * Every action now surfaces a success toast (was: silent success,
 * trainer relied on the page refresh to confirm anything happened).
 */
export function SessionActions({ session }: { session: Session }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  if (session.status === "requested") {
    return (
      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await approveSessionRequest(session.id);
              if (!r.ok) {
                toast.error(r.error || "couldn't approve. try again.");
                return;
              }
              toast.success("request approved.");
              router.refresh();
            })
          }
        >
          approve
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await declineSessionRequest({ sessionId: session.id });
              if (!r.ok) {
                toast.error(r.error || "couldn't decline. try again.");
                return;
              }
              toast.success("request declined.");
              router.refresh();
            })
          }
        >
          decline
        </Button>
      </div>
    );
  }

  if (session.status === "scheduled") {
    return (
      <Button
        variant="outline"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: "cancel this session?",
            body: "the client's session credit will be restored.",
            confirmLabel: "cancel session",
            cancelLabel: "keep it",
            tone: "danger",
          });
          if (!ok) return;
          startTransition(async () => {
            const r = await cancelSession({ sessionId: session.id, actor: "trainer" });
            if (!r.ok) {
              toast.error(r.error || "couldn't cancel. try again.");
              return;
            }
            toast.success("session cancelled.");
            router.refresh();
          });
        }}
      >
        cancel session
      </Button>
    );
  }
  return null;
}
