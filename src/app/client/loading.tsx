import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lightweight loading shape for the client portal. Mirrors the real
 * layout (profile strip + calendar list) so there's no jarring jump
 * when the data lands.
 */
export default function ClientPortalLoading() {
  return (
    <div className="space-y-6 md:space-y-8">
      <Skeleton className="h-32 md:h-36" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-36 rounded-full" />
        </div>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}
