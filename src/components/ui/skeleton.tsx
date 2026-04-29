import { cn } from "@/lib/utils";

/**
 * Single-purpose loading shimmer block. Use for the rare moments when
 * SSR data takes long enough to flash empty content. Brand-aligned —
 * uses parchment tones, no gray.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-2xl bg-[color:var(--color-parchment)]/60",
        className,
      )}
    />
  );
}
