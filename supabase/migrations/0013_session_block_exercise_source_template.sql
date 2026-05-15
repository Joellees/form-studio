-- `session_block_exercises.source_template_id` — nullable FK back to
-- the workout template that was applied to seed this session row.
--
-- Used by the "apply workout to session" flow shipped in branch 1 of
-- the session-logging UX overhaul. When a trainer applies workout
-- `Push Day` to a client's session, every session_block_exercise
-- copied across stores `source_template_id = Push Day's id` so the
-- session log can render a small "from Push Day" badge on each card.
--
-- ON DELETE SET NULL so deleting a template doesn't cascade-delete
-- session log history — the breadcrumb just disappears.
--
-- Stays nullable: exercises added ad-hoc (via the existing
-- addExerciseToSession path / tap-an-exercise-in-sidebar) have no
-- source template.
--
-- Index is partial (WHERE source_template_id IS NOT NULL) because
-- most session_block_exercises will have NULL here — keeps it small
-- and only useful for the rare "which sessions used template X"
-- reverse lookup if we ever need it.
--
-- App reads of `source_template_id` use a try-wide-then-narrow
-- pattern (similar to migration 0011/0012 fallbacks) so the deploy
-- is safe to ship ahead of this migration being applied on prod.

alter table public.session_block_exercises
  add column if not exists source_template_id uuid
    references public.session_templates(id) on delete set null;

create index if not exists session_block_exercises_source_template_idx
  on public.session_block_exercises (source_template_id)
  where source_template_id is not null;

comment on column public.session_block_exercises.source_template_id is
  'Workout template that was applied to seed this row, if any. Null for ad-hoc exercise adds. Powers the "from <workout>" badge on session log cards.';
