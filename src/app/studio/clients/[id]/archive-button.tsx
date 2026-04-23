"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setClientArchived } from "./actions";
import { Button } from "@/components/ui/button";

export function ArchiveClientButton({ clientId, archived }: { clientId: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const verb = archived ? "restore" : "archive";
    if (!confirm(`Are you sure you want to ${verb} this client?`)) return;
    startTransition(async () => {
      const r = await setClientArchived({ clientId, archived: !archived });
      if (!r.ok) {
        alert(r.error);
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
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? "…" : archived ? "restore" : "archive client"}
    </Button>
  );
}
