"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteGroup, renameGroup, saveGroup } from "../actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Group = { id: string; name: string; sort_index: number };

export function GroupsSection({
  groups,
  exerciseCountByGroup,
}: {
  groups: Group[];
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
        matches how you think. You&rsquo;ll pick one when you add an exercise.
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
          body="Add one above. You can change or delete them any time."
        />
      ) : (
        <ul className="divide-y divide-[color:var(--color-stone-soft)]/70 rounded-2xl border border-[color:var(--color-stone-soft)]/60 bg-[color:var(--color-parchment)]/40">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              count={exerciseCountByGroup[g.id] ?? 0}
              onChange={() => router.refresh()}
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
  onChange,
}: {
  group: Group;
  count: number;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [pending, startTransition] = useTransition();

  function save() {
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
      onChange();
    });
  }

  function remove() {
    const msg =
      count > 0
        ? `Delete "${group.name}"? The ${count} exercise${count === 1 ? "" : "s"} in this group will be ungrouped.`
        : `Delete "${group.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      await deleteGroup(group.id);
      onChange();
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      {editing ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
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
          onClick={() => setEditing(true)}
          className="flex-1 text-left font-medium hover:text-[color:var(--color-moss-deep)]"
        >
          {group.name}
        </button>
      )}
      <span className="tabular-nums text-xs text-[color:var(--color-stone)]">{count}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={remove}
        disabled={pending}
        className="text-[color:var(--color-sienna)] hover:bg-[color:var(--color-sienna)]/10"
      >
        delete
      </Button>
    </li>
  );
}
