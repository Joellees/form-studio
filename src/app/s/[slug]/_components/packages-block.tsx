import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type Pkg = {
  id: string;
  name: string;
  /** Optional client-facing summary. Replaced the session_type_mix
   * badge as the human-readable description of the package. */
  description?: string | null;
  session_count: number;
  duration_days: number;
  price_usd: number;
  cancellation_policy: string;
};

export function PackagesBlock({ packages, trainerName }: { packages: Pkg[]; trainerName: string }) {
  if (packages.length === 0) {
    return (
      <EmptyState bordered
        title="New packages coming soon"
        body={`${trainerName} is preparing packages for new clients. Check back in a few days.`}
      />
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => (
        <Card key={pkg.id}>
          <CardHeader>
            <CardTitle>{pkg.name}</CardTitle>
            {pkg.description ? (
              <p className="mt-2 whitespace-pre-line text-sm text-[color:var(--color-ink)]/75">
                {pkg.description}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 text-sm text-[color:var(--color-ink)]/75 tabular-nums">
              <p>
                <span className="font-medium text-[color:var(--color-ink)]">{pkg.session_count}</span> sessions
              </p>
              <p>over {pkg.duration_days} days</p>
              <p>
                cancellation · {pkg.cancellation_policy === "credited" ? "reschedule" : "counted session"}
              </p>
            </div>
            <p className="mt-6 text-3xl tabular-nums">
              ${pkg.price_usd.toLocaleString()}
              <span className="ml-1 text-sm text-[color:var(--color-stone)]">usd</span>
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full" size="lg">
              <Link href={`/subscribe/${pkg.id}`}>reserve this block</Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
