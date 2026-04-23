import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type Pkg = {
  id: string;
  name: string;
  session_type_mix: string;
  session_count: number;
  duration_days: number;
  price_usd: number;
  cancellation_policy: string;
};

export function PackagesBlock({ packages, trainerName }: { packages: Pkg[]; trainerName: string }) {
  if (packages.length === 0) {
    return (
      <EmptyState
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
            <div className="flex items-center justify-between">
              <CardTitle>{pkg.name}</CardTitle>
              <Badge tone="moss">{pkg.session_type_mix.replace("_", " + ")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 text-sm text-[color:var(--color-ink)]/75 tabular-nums">
              <p>
                <span className="font-medium text-[color:var(--color-ink)]">{pkg.session_count}</span> sessions
              </p>
              <p>over {pkg.duration_days} days</p>
              <p className="capitalize">
                cancellation · {pkg.cancellation_policy === "credited" ? "credited back" : "forfeits session"}
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
