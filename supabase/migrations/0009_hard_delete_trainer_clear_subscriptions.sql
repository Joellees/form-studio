-- Extend `hard_delete_trainer` to clear the out-of-band `trainer_subscriptions`
-- and `trainer_subscription_events` rows before the trainer DELETE.
--
-- Why this is needed:
--   Migration 0005 wrote `hard_delete_trainer` at a time when the
--   subscription state was carried on `subscriptions` (paid_confirmed_by
--   FK noted) and the audit pointers were `subscription_status_log` /
--   `access_codes.created_by` / etc. Two NEW tables were added after
--   0005 to track the trainer-level subscription:
--
--     - `trainer_subscriptions(studio_id uuid → trainers(id))`
--     - `trainer_subscription_events(studio_id uuid → trainers(id),
--                                    trainer_subscription_id uuid → trainer_subscriptions(id))`
--
--   The FKs from these new tables to `trainers` were created without
--   `ON DELETE CASCADE` (otherwise the original `hard_delete_trainer`
--   would still work). Result: a hard-delete on any trainer that has a
--   `trainer_subscriptions` row (every trainer who came through /beta
--   redemption — i.e. all Beta-1 founders and Beta-2 sign-ups) fails
--   with a `foreign_key_violation`.
--
-- Fix shape:
--   Use the same pattern as the existing access_codes clearing in 0005:
--   explicit DELETEs inside the function ahead of the trainer DELETE,
--   so the operation stays atomic (rolled back together if any step
--   fails). Order is events → subscriptions because the events row's
--   `trainer_subscription_id` FK might itself need clearing first.
--   We DELETE rather than null-out: trainer subscription history is
--   tied 1:1 to the (now-gone) trainer and has no meaning detached.
--
--   `subscription_status_log` is intentionally NOT touched here — its
--   `changed_by` FK to trainers is already `ON DELETE SET NULL` per
--   migration 0005's design notes, and its `subscription_id` FK cascades
--   when the subscriptions rows go (which they do via CASCADE on trainer
--   delete). If a future audit reveals a `subscription_status_log.tenant_id`
--   FK that blocks, add the corresponding DELETE here in a follow-up
--   migration.
--
-- Not testable from this environment (no Studio access at write time);
-- the migration is conservative — it ONLY adds DELETEs, doesn't drop or
-- recreate FKs, doesn't change any other behaviour. If the function
-- previously worked on a given trainer, it still will after this. If
-- it failed on the new-tables FK, it now succeeds.

create or replace function public.hard_delete_trainer(
  p_studio_id uuid,
  p_confirm_display_name text
) returns void
language plpgsql
as $$
declare
  v_display_name text;
  v_clerk_id text;
begin
  -- 1. Fetch + verify the target.
  select display_name, clerk_id
    into v_display_name, v_clerk_id
    from public.trainers
   where id = p_studio_id;

  if not found then
    raise exception 'Trainer not found' using errcode = 'no_data_found';
  end if;

  if v_display_name <> p_confirm_display_name then
    raise exception 'Display-name confirmation failed' using errcode = 'check_violation';
  end if;

  -- 2. Clear the FK that would otherwise block the delete (paid_confirmed_by
  -- has no ON DELETE clause — see 0005 notes).
  update public.subscriptions
     set paid_confirmed_by = null
   where paid_confirmed_by = p_studio_id;

  -- 3. Clear access-code bindings (preserve the codes themselves — they
  -- can be reused or audited).
  update public.access_codes
     set bound_to_studio_id = null,
         bound_to_clerk_user_id = null
   where bound_to_studio_id = p_studio_id
      or (v_clerk_id is not null and bound_to_clerk_user_id = v_clerk_id);

  -- 4. NEW (0009): Delete trainer_subscriptions + their event audit
  -- rows. These tables' FKs to trainers were created without ON DELETE
  -- CASCADE; without this step the trainer DELETE below fails with a
  -- foreign_key_violation. Events first because their FK back to
  -- trainer_subscriptions is the inner constraint.
  delete from public.trainer_subscription_events
   where studio_id = p_studio_id;
  delete from public.trainer_subscriptions
   where studio_id = p_studio_id;

  -- 5. Delete the trainer. Remaining CASCADE / SET NULL FKs handle
  -- the rest (clients, sessions, packages, exercises, subscriptions,
  -- payments, audit logs).
  delete from public.trainers where id = p_studio_id;
end;
$$;

comment on function public.hard_delete_trainer(uuid, text) is
  'Admin-only. Atomically hard-deletes a trainer (cascades clients, sessions, etc.). '
  'Requires the exact display_name as confirmation. Storage objects are NOT touched. '
  'Updated in 0009 to clear trainer_subscriptions + trainer_subscription_events '
  'rows (their FKs to trainers have no ON DELETE CASCADE, which blocked the delete).';
