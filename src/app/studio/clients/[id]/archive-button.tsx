"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setClientArchived } from "./actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function ArchiveClientButton({ clientId, archived }: { clientId: string; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function onClick() {
    const ok = await confirm(
      archived
        ? {
            title: "restore this client?",
            body: "they'll appear in your active list again.",
            confirmLabel: "restore",
          }
        : {
            title: "archive this client?",
            body: "their history stays. you can restore them anytime.",
            confirmLabel: "archive",
            tone: "danger",
          },
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await setClientArchived({ clientId, archived: !archived });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (!archived) {
        router.push("/studio/clients");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void onClick()} disabled={pending}>
      {pending ? "…" : archived ? "restore" : "archive client"}
    </Button>
  );
}
