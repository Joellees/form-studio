"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { approveSessionRequest, cancelSession } from "@/app/studio/calendar/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Session = { id: string; status: string };

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
              if (!r.ok) toast.error(r.error);
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
              const r = await cancelSession({
                sessionId: session.id,
                actor: "trainer",
                reason: "declined",
              });
              if (!r.ok) toast.error(r.error);
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
            if (!r.ok) toast.error(r.error);
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
