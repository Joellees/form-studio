-- Optional 7-day trial flag on Beta 2 access codes.
--
-- Two columns, intentionally on separate tables:
--
--   access_codes.trial_days       — integer, nullable. NULL means "no
--                                   trial" (the default for every
--                                   existing code; admin opts in at
--                                   generation time). 7 is the only
--                                   value currently used in the
--                                   admin UI, but the column is an
--                                   integer so we can support other
--                                   lengths later without schema
--                                   churn.
--
--   trainers.trial_started_at     — timestamptz, nullable. Set at
--                                   onboarding-time IF the redeemed
--                                   access code carried a non-null
--                                   trial_days. The gate logic
--                                   (`hasStudioAccess` in
--                                   src/lib/subscription.ts) reads
--                                   this + the trial length to
--                                   decide whether to let the
--                                   trainer reach /studio/dashboard
--                                   or bounce them to /studio/expired.
--
-- Why two columns, not just one trial_ends_at on trainers:
-- - The trial length is decided by the code, not the trainer. Coding
--   the length once on the code means changing it later (e.g. 14-day
--   promo codes) means generating new codes, not migrating trainer
--   rows.
-- - `trial_started_at` is a wall-clock anchor; the gate computes
--   expiration as `started_at + trial_days * 24h`. Audit-friendly:
--   the row keeps both pieces and we can answer "when did this
--   trainer's trial start" forever without a separate audit table.
--
-- All app reads of these columns use the column-missing-tolerant
-- pattern (PostgREST 42703 caught at query time, fallback path). So
-- the deploy is safe to ship before this migration is applied — the
-- trial feature simply doesn't activate until the columns exist.
--
-- `add column if not exists` makes the migration idempotent.

alter table public.access_codes
  add column if not exists trial_days integer check (trial_days is null or trial_days > 0);

comment on column public.access_codes.trial_days is
  'When non-null, redeeming this code grants the trainer a trial of this many days. Null = no trial (existing default). Set by admin at generation time.';

alter table public.trainers
  add column if not exists trial_started_at timestamptz;

comment on column public.trainers.trial_started_at is
  'Wall-clock anchor set at onboarding when the redeemed access code had trial_days set. Combined with the code''s trial_days, the hasStudioAccess gate computes whether the trial is still active.';
