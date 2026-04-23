"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cancelSession } from "@/app/studio/calendar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Session = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  session_type: string;
  status: string;
  name: string | null;
  zoom_url: string | null;
};

export function ClientSessionRow({
  session,
  timezone,
  formatInTz,
}: {
  session: Session;
  timezone: string;
  formatInTz: (d: Date, tz: string, pattern: string) => string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onCancel() {
    if (!confirm("Cancel this session? If you&rsquo;re past the cutoff this may forfeit it.")) return;
    startTransition(async () => {
      const result = await cancelSession({ sessionId: session.id, actor: "client" });
      if (!result.ok) alert(result.error);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div>
        <p className="text-xs tabular-nums text-[color:var(--color-stone)]">
          {formatInTz(new Date(session.scheduled_at), timezone, "EEE, MMM d · HH:mm")} · {session.duration_minutes} min
        </p>
        <p className="font-medium">
          <Link href={`/client/sessions/${session.id}`} className="hover:text-[color:var(--color-moss-deep)]">
            {session.name ?? session.session_type.replace("_", " ")}
          </Link>
        </p>
        {session.zoom_url ? (
          <a href={session.zoom_url} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--color-moss)]">
            join zoom
          </a>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={session.status === "requested" ? "signal" : "moss"}>{session.status}</Badge>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>
          cancel
        </Button>
      </div>
    </li>
  );
}
