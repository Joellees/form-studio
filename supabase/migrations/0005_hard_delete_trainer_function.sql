-- Hard-delete a trainer atomically.
--
-- The /admin tool exposes this through a confirmation modal that requires
-- typing the trainer's exact display_name. The function:
--
--   1. Verifies the trainer exists and the confirmation string matches
--      display_name exactly (byte-for-byte).
--   2. Clears the one FK that would otherwise BLOCK the delete:
--      `subscriptions.paid_confirmed_by` (no ON DELETE clause). This nulls
--      the audit pointer on any subscription whose payment was confirmed
--      by the trainer-about-to-be-deleted (typically applies when the
--      same person is both admin and trainer).
--   3. Clears access-code bindings explicitly — `bound_to_studio_id` would
--      auto-null via the FK's ON DELETE SET NULL, but we also need to
--      clear `bound_to_clerk_user_id` which is a plain TEXT column with no
--      FK relationship to trainers. Doing both in one UPDATE keeps the
--      logic obvious.
--   4. DELETEs the trainer row. Postgres cascades:
--      - 23 FKs with ON DELETE CASCADE → auto-delete (clients, sessions,
--        packages, exercises, subscriptions, payments, audit logs, etc.)
--      - 9 FKs with ON DELETE SET NULL → auto-null (audit pointers like
--        access_codes.created_by, subscription_status_log.changed_by, etc.)
--
-- Everything runs in the function's implicit transaction. Any RAISE
-- EXCEPTION (verification failure, FK violation we missed, etc.) rolls
-- back the entire operation.
--
-- NOT handled by this function:
--   - Supabase Storage objects under exercise-videos/<tenant_id>/* and
--     client-progress/<tenant_id>/*. Storage deletion lives outside SQL.
--     See the TODO in `src/app/admin/actions.ts::hardDeleteTrainer`.
--   - `access_code_events.clerk_user_id` text references — these are
--     deliberately preserved for the audit trail.
--
-- Callable via PostgREST `.rpc('hard_delete_trainer', { p_studio_id, p_confirm_display_name })`
-- using the service-role admin client (admin actions only).

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

  -- 2. Clear the FK that would otherwise block the delete.
  update public.subscriptions
     set paid_confirmed_by = null
   where paid_confirmed_by = p_studio_id;

  -- 3. Clear access-code bindings (preserve the codes themselves).
  update public.access_codes
     set bound_to_studio_id = null,
         bound_to_clerk_user_id = null
   where bound_to_studio_id = p_studio_id
      or (v_clerk_id is not null and bound_to_clerk_user_id = v_clerk_id);

  -- 4. Delete the trainer. CASCADE / SET NULL FKs handle the rest.
  delete from public.trainers where id = p_studio_id;
end;
$$;

comment on function public.hard_delete_trainer(uuid, text) is
  'Admin-only. Atomically hard-deletes a trainer (cascades clients, sessions, etc.). '
  'Requires the exact display_name as confirmation. Storage objects are NOT touched.';
