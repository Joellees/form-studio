-- Opt-in field model for the workout exercise row.
--
-- The trainer-facing UX is shifting from a fixed-grid row (sets, reps,
-- weight, rest all forced visible whether the trainer wants them or
-- not) to an opt-in row: only Sets is shown by default, and the
-- trainer adds Reps, Weight, Tempo, RPE, Time, or Rest from a popover.
--
-- Storage shape:
--   - `active_fields` jsonb array of string keys lists which optional
--     fields the trainer has added to this set group. Sets is always
--     present and is NOT in `active_fields`. Field keys are:
--       "reps", "weight", "tempo", "rpe", "time", "rest"
--   - Existing columns `rep_type`/`rep_value`/`weight_type`/
--     `weight_value`/`rest_seconds` keep the data for their respective
--     fields when active.
--   - New columns model the fields we didn't previously support:
--       `tempo`        text     — e.g. "3-1-2" or "30X1"
--       `rpe`          text     — e.g. "8" or "8-9" (text so a range
--                                works without a second column)
--       `time_seconds` int      — duration for the Time field, kept
--                                independent of `rep_value` so an
--                                exercise can carry BOTH Reps and Time
--                                (e.g. planks done for time with a
--                                separate rep count).
--
-- Nullability: a row can now have NO Reps and NO Weight added at all,
-- so we drop NOT NULL on `rep_type` and `weight_type`. The existing
-- check constraints (`rep_type in (...)`) pass for NULL automatically
-- — Postgres evaluates `null in (...)` as null, which the row-level
-- check treats as ok.
--
-- Backfill: every pre-existing row was rendered with the old fixed
-- grid, i.e. reps + weight + rest were all implicitly active. We
-- backfill `active_fields := ['reps','weight','rest']` for those rows.
-- New rows inserted by the addExerciseToTemplate / addSetGroup path
-- now seed `active_fields := []` so only Sets shows up until the
-- trainer opts fields in via the popover.
--
-- Same shape change applied to `session_set_groups` (the
-- session-logging mirror) so applying a template to a session
-- preserves the opt-in selection. Session-side performed_* columns
-- are not affected here.

-- ─── template_set_groups ────────────────────────────────────────────

alter table public.template_set_groups
  add column if not exists active_fields jsonb not null default '[]'::jsonb,
  add column if not exists tempo text,
  add column if not exists rpe text,
  add column if not exists time_seconds integer
    check (time_seconds is null or time_seconds > 0);

update public.template_set_groups
   set active_fields = '["reps","weight","rest"]'::jsonb
 where active_fields = '[]'::jsonb;

alter table public.template_set_groups
  alter column rep_type drop not null,
  alter column weight_type drop not null;

-- ─── session_set_groups ─────────────────────────────────────────────

alter table public.session_set_groups
  add column if not exists active_fields jsonb not null default '[]'::jsonb,
  add column if not exists tempo text,
  add column if not exists rpe text,
  add column if not exists time_seconds integer
    check (time_seconds is null or time_seconds > 0);

update public.session_set_groups
   set active_fields = '["reps","weight","rest"]'::jsonb
 where active_fields = '[]'::jsonb;

alter table public.session_set_groups
  alter column rep_type drop not null,
  alter column weight_type drop not null;
