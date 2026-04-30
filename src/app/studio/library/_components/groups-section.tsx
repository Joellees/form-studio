"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  deleteGroup,
  linkExercisesToGroups,
  renameGroup,
  saveGroup,
  unlinkExerciseFromGroup,
} from "../actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Group = { id: string; name: string; sort_index: number; is_universal?: boolean };
type LightExercise = { id: string; name: string; group_ids: string[] };

export function GroupsSection({
  groups,
  exercises,
  exerciseCountByGroup,
}: {
  groups: Group[];
  exercises: LightExercise[];
  exerciseCountByGroup: Record<string, number>;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await saveGroup({ name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <p className="max-w-xl text-sm text-[color:var(--color-ink)]/70">
        Groups are your way of organizing the library — push / pull / hinge, mobility, warm-up, whatever
        matches how you think. Each exercise can live in any number of groups; expand a group to manage
        the exercises inside.
      </p>

      <form onSubmit={onAdd} className="flex items-end gap-3">
        <div className="flex-1 max-w-md">
          <Label htmlFor="new-group">new group</Label>
          <Input
            id="new-group"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. lower push"
            maxLength={40}
          />
        </div>
        <Button type="submit" disabled={pending || !newName.trim()}>
          add group
        </Button>
      </form>
      {error ? <p className="text-xs text-[color:var(--color-sienna)]">{error}</p> : null}

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          body="Add one above. Built-in groups stay; the ones you add are yours to rename or remove."
        />
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              count={exerciseCountByGroup[g.id] ?? 0}
              exercises={exercises}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupRow({
  group,
  count,
  exercises,
}: {
  group: Group;
  count: number;
  exercises: LightExercise[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);

  const inGroup = useMemo(
    () => exercises.filter((ex) => ex.group_ids.includes(group.id)),
    [exercises, group.id],
  );
  const outOfGroup = useMemo(
    () => exercises.filter((ex) => !ex.group_ids.includes(group.id)),
    [exercises, group.id],
  );

  function saveName() {
    if (!name.trim() || name === group.name) {
      setEditing(false);
      setName(group.name);
      return;
    }
    startTransition(async () => {
      const result = await renameGroup({ id: group.id, name: name.trim() });
      if (!result.ok) {
        alert(result.error);
        setName(group.name);
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    const msg =
      count > 0
        ? `Delete "${group.name}"? The ${count} exercise${count === 1 ? "" : "s"} in this group stay in your library — only the link is removed.`
        : `Delete "${group.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      await deleteGroup(group.id);
      router.refresh();
    });
  }

  function unlink(exerciseId: string) {
    startTransition(async () => {
      const result = await unlinkExerciseFromGroup({ exerciseId, groupId: group.id });
      if (!result.ok) alert(result.error);
      router.refresh();
    });
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-parchment)]/40">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        {editing ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(group.name);
                setEditing(false);
              }
            }}
            className="max-w-xs"
            maxLength={40}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex-1 text-left font-medium hover:text-[color:var(--color-moss-deep)]"
          >
            {group.name}{" "}
            <span className="ml-1 text-xs tabular-nums text-[color:var(--color-stone)]">{count}</span>
          </button>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing((v) => !v)}
            disabled={pending}
          >
            {editing ? "done" : "rename"}
          </Button>
          {group.is_universal ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]/80">
              built-in
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={remove}
              disabled={pending}
              className="text-[color:var(--color-sienna)] hover:bg-[color:var(--color-sienna)]/10"
            >
              delete
            </Button>
          )}
        </div>
      </div>

      {open ? (
        <div className="border-t border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-canvas)] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-stone)]">
              exercises in this group
            </p>
            <Button size="sm" onClick={() => setPicking(true)} disabled={pending}>
              add exercises
            </Button>
          </div>
          {inGroup.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--color-ink)]/65">
              Nothing here yet. Add some via the button on the right.
            </p>
          ) : (
            <ul className="mt-3 grid gap-1 md:grid-cols-2">
              {inGroup.map((ex) => (
                <li
                  key={ex.id}
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 hover:bg-[color:var(--color-parchment)]/50"
                >
                  <span className="truncate text-sm">{ex.name}</span>
                  <button
                    type="button"
                    onClick={() => unlink(ex.id)}
                    disabled={pending}
                    className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-stone)] hover:text-[color:var(--color-sienna)]"
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {picking ? (
        <PickExercisesModal
          group={group}
          available={outOfGroup}
          onClose={() => setPicking(false)}
          onSaved={() => {
            setPicking(false);
            router.refresh();
          }}
        />
      ) : null}
    </li>
  );
}

function PickExercisesModal({
  group,
  available,
  onClose,
  onSaved,
}: {
  group: Group;
  available: LightExercise[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const filtered = available.filter((ex) =>
    query ? ex.name.toLowerCase().includes(query.toLowerCase()) : true,
  );

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError(null);
    if (chosen.size === 0) {
      setError("Pick at least one.");
      return;
    }
    startTransition(async () => {
      const result = await linkExercisesToGroups({
        exerciseIds: [...chosen],
        groupIds: [group.id],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/40 p-0 md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-[color:var(--color-canvas)] shadow-[0_24px_64px_-12px_rgba(31,30,27,0.35)] md:max-h-[80vh] md:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--color-stone-soft)]/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-moss)]">
              add exercises
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">to {group.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--color-stone)] hover:bg-[color:var(--color-parchment)]"
            aria-label="close"
          >
            ×
          </button>
        </div>
        <div className="border-b border-[color:var(--color-stone-soft)]/60 px-6 py-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search your library"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[color:var(--color-ink)]/65">
              {available.length === 0
                ? "Every exercise in your library is already in this group."
                : "No matches."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((ex) => {
                const on = chosen.has(ex.id);
                return (
                  <li key={ex.id}>
                    <button
                      type="button"
                      onClick={() => toggle(ex.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-[color:var(--color-parchment)] ${
                        on ? "bg-[color:var(--color-parchment)]" : ""
                      }`}
                    >
                      <span className="truncate">{ex.name}</span>
                      <span
                        className={`ml-3 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          on
                            ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-canvas)]"
                            : "border-[color:var(--color-stone-soft)]"
                        }`}
                        aria-hidden
                      >
                        {on ? (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2 6l3 3 5-6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--color-stone-soft)]/60 px-6 py-4">
          {error ? (
            <p className="mr-auto text-xs text-[color:var(--color-sienna)]">{error}</p>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            cancel
          </Button>
          <Button onClick={save} disabled={pending || chosen.size === 0}>
            {pending ? "adding…" : `add ${chosen.size}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
