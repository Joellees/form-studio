-- Allow one exercise to live in multiple groups (e.g. "Romanian
-- deadlift" can be in both "lower body" and "posterior chain").
--
-- Schema: a junction table; (exercise_id, group_id) is the unique pair.
-- The legacy `exercises.group_id` column stays for now as a "primary
-- group" pointer used by the exercise edit form's first chip — every
-- non-null value is mirrored into the junction so both code paths see
-- the same data.

create table if not exists public.exercise_group_memberships (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  group_id uuid not null references public.exercise_groups(id) on delete cascade,
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (exercise_id, group_id)
);

create index if not exists exercise_group_memberships_group_idx
  on public.exercise_group_memberships (group_id);
create index if not exists exercise_group_memberships_tenant_idx
  on public.exercise_group_memberships (tenant_id);

-- Backfill: every exercise with a single group already assigned gets
-- the matching membership row. Idempotent — `on conflict do nothing`
-- means re-running this migration is safe.
insert into public.exercise_group_memberships (exercise_id, group_id, tenant_id)
select id, group_id, tenant_id
from public.exercises
where group_id is not null
on conflict (exercise_id, group_id) do nothing;
