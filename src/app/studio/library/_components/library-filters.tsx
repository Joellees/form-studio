"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";

export function LibraryFilters({
  groups,
  initialQuery,
  initialGroup,
}: {
  groups: string[];
  initialQuery: string;
  initialGroup: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(initialQuery);

  const apply = useCallback(
    (next: { q?: string; group?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      startTransition(() => router.replace(`?${params.toString()}`));
    },
    [router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        value={q}
        placeholder="search by name"
        className="max-w-xs"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply({ q });
        }}
        onBlur={() => apply({ q })}
      />
      <select
        value={initialGroup}
        onChange={(e) => apply({ group: e.target.value })}
        className="h-10 rounded-xl border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] px-3 text-sm"
      >
        <option value="">all groups</option>
        {groups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  );
}
