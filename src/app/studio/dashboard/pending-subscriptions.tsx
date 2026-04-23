"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { markSubscriptionPaid } from "../subscriptions/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type PendingRow = {
  id: string;
  createdAt: string;
  clientName: string;
  packageName: string;
  priceUsd: number;
};

export function PendingSubscriptions({ rows }: { rows: PendingRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirmPaid(subscriptionId: string) {
    startTransition(async () => {
      const result = await markSubscriptionPaid({ subscriptionId });
      if (!result.ok) alert(result.error);
      router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>client</TableHead>
          <TableHead>package</TableHead>
          <TableHead className="text-right">amount</TableHead>
          <TableHead className="text-right">requested</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.clientName}</TableCell>
            <TableCell>{r.packageName}</TableCell>
            <TableCell className="text-right tabular-nums">${r.priceUsd.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums text-[color:var(--color-ink)]/70">
              {new Date(r.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Badge tone="signal">pending</Badge>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => confirmPaid(r.id)}>
                  mark paid
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
