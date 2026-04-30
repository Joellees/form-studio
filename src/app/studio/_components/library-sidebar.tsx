"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type LibrarySidebarExercise = {
  id: string;
  name: string;
  group_id: string | null;
};

export type LibrarySidebarGroup = {
  id: string;
  name: string;
};

/**
 * Shared library picker used by the template + session builders. Adds
 * a search input and renders exercises grouped under collapsible
 * sections so trainers with big libraries can scan by group rather
 * than scrolling a flat list.
 *
 * When `onCreate` is provided, a "+ new exercise" footer reveals a
 * small inline form (name + group). Saving creates the exercise in
 * the library AND immediately adds it to the surface (workout /
 * session) — exactly what the trainer means by "add a new one as I'm
 * building this".
 */
export function LibrarySidebar({
  exercises,
  groups,
  onAdd,
  onCreate,
  pending,
  emptyHint,
}: {
  exercises: LibrarySidebarExercise[];
  groups: LibrarySidebarGroup[];
  onAdd: (exerciseId: string) => void;
  /**
   * Optional. Receives a name + group id and returns the new
   * exercise's id (so the caller can append it to the workout).
   * If omitted, the "+ new exercise" affordance is hidden.
   */
  onCreate?: (input: { name: string; groupId: string | null }) => Promise<string | null>;
  pending?: boolean;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [savingNew, startSave] = useTransition();
  const trimmedQuery = query.trim().toLowerCase();

  const sections = useMemo(() => {
    const filtered = exercises.filter((e) =>
      trimmedQuery ? e.name.toLowerCase().includes(trimmedQuery) : true,
    );
    const byGroup = new Map<string, LibrarySidebarExercise[]>();
    for (const ex of filtered) {
      const key = ex.group_id ?? "__ungrouped";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(ex);
    }
    const ordered: Array<{ key: string; name: string; items: LibrarySidebarExercise[] }> = [];
    for (const g of groups) {
      const items = byGroup.get(g.id);
      if (items?.length) ordered.push({ key: g.id, name: g.name, items });
    }
    const ungrouped = byGroup.get("__ungrouped");
    if (ungrouped?.length) ordered.push({ key: "__ungrouped", name: "Unassigned", items: ungrouped });
    return ordered;
  }, [exercises, groups, trimmedQuery]);

  // While searching, expand everything so matches are always visible.
  // Otherwise, fall back to the user's per-group toggle state.
  function isOpen(key: string): boolean {
    if (trimmedQuery) return true;
    return openGroups[key] ?? false;
  }

  function toggle(key: string) {
    setOpenGroups((s) => ({ ...s, [key]: !s[key] }));
  }

  if (exercises.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>library</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[color:var(--color-ink)]/70">
            {emptyHint ?? "Add exercises to your library first."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>library</CardTitle>
      </CardHeader>
      <CardContent>
        <Input
          placeholder="search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3"
        />
        {sections.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink)]/70">
            No matches — try a different search.
          </p>
        ) : (
          <ul className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
            {sections.map((section) => {
              const open = isOpen(section.key);
              return (
                <li key={section.key} className="rounded-2xl">
                  <button
                    type="button"
                    onClick={() => toggle(section.key)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-[color:var(--color-parchment)]/60"
                  >
                    <span className="flex items-center gap-2">
                      <Chevron open={open} />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-stone)]">
                        {section.name}
                      </span>
                    </span>
                    <span className="text-[11px] tabular-nums text-[color:var(--color-stone)]/80">
                      {section.items.length}
                    </span>
                  </button>
                  {open ? (
                    <ul className="mt-1 space-y-0.5 pl-5">
                      {section.items.map((ex) => (
                        <li
                          key={ex.id}
                          className="flex items-center justify-between gap-2 rounded-xl px-2 py-1 hover:bg-[color:var(--color-parchment)]/60"
                        >
                          <p className="min-w-0 truncate text-sm">{ex.name}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onAdd(ex.id)}
                            disabled={pending}
                          >
                            add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {onCreate ? (
          <div className="mt-3 border-t border-[color:var(--color-stone-soft)]/60 pt-3">
            {creating ? (
              <div className="space-y-2">
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="exercise name"
                />
                <select
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value)}
                  className="select-pill h-9 w-full rounded-full border border-[color:var(--color-stone-soft)] bg-[color:var(--color-canvas)] text-sm"
                >
                  <option value="">no group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[color:var(--color-stone)]">
                  Quick add — name + group only. You can fill in the video,
                  default sets, and notes from the exercise editor afterward
                  via the{" "}
                  <a
                    href="/studio/library/new"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-[color:var(--color-moss-deep)]"
                  >
                    full editor
                  </a>
                  .
                </p>
                {createError ? (
                  <p className="text-xs text-[color:var(--color-sienna)]">{createError}</p>
                ) : null}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={savingNew || !newName.trim()}
                    onClick={() =>
                      startSave(async () => {
                        setCreateError(null);
                        const id = await onCreate({
                          name: newName.trim(),
                          groupId: newGroupId || null,
                        });
                        if (!id) {
                          setCreateError("Couldn't save. Try a different name.");
                          return;
                        }
                        setNewName("");
                        setNewGroupId("");
                        setCreating(false);
                      })
                    }
                  >
                    {savingNew ? "saving…" : "create + add"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={savingNew}
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                      setNewGroupId("");
                      setCreateError(null);
                    }}
                  >
                    cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCreating(true)}
                disabled={pending}
              >
                + new exercise
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={`transition-transform ${open ? "rotate-90" : ""} text-[color:var(--color-stone)]`}
    >
      <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
