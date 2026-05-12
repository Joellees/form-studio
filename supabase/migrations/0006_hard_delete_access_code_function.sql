-- Hard-delete an access code (and its audit-log events) atomically.
--
-- Counterpart to `hard_delete_trainer`. Exposed via /admin/codes for codes
-- that should be permanently removed (e.g. a typo, a generation mistake,
-- or a revoked-and-never-claimed code cluttering the list).
--
-- Safety:
--   1. Verifies the code exists and the confirmation string matches the
--      `code` value byte-for-byte. The check is inside the function so it
--      can't be bypassed by calling the action with a fake payload.
--   2. REFUSES if the code is bound to a trainer who still has an active
--      (not-soft-deleted) `trainers` row. Deleting in that case would
--      orphan the trainer's redemption path. Soft-deleted trainers are
--      considered detached for this purpose — their code is safe to delete.
--      Hard-deleted trainers automatically have `bound_to_studio_id` set
--      to NULL via the FK's ON DELETE SET NULL.
--
-- The DELETE on `access_codes` cascades to `access_code_events` via the
-- existing FK (`access_code_id` ON DELETE CASCADE), so both go away as
-- one atomic operation inside the function's implicit transaction.
--
-- Callable via PostgREST `.rpc('hard_delete_access_code', { ... })`
-- using the service-role admin client (admin actions only).

create or replace function public.hard_delete_access_code(
  p_access_code_id uuid,
  p_confirm_code text
) returns void
language plpgsql
as $$
declare
  v_code text;
  v_bound_studio_id uuid;
  v_bound_active boolean;
begin
  -- 1. Fetch + verify.
  select code, bound_to_studio_id
    into v_code, v_bound_studio_id
    from public.access_codes
   where id = p_access_code_id;

  if not found then
    raise exception 'Access code not found' using errcode = 'no_data_found';
  end if;

  if v_code <> p_confirm_code then
    raise exception 'Code confirmation failed' using errcode = 'check_violation';
  end if;

  -- 2. Refuse if bound to a still-active trainer.
  if v_bound_studio_id is not null then
    select exists(
      select 1 from public.trainers
       where id = v_bound_studio_id and soft_deleted_at is null
    ) into v_bound_active;
    if v_bound_active then
      raise exception 'Cannot delete code: still bound to an active trainer (% — would orphan their access)', v_bound_studio_id
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  -- 3. Delete. The FK `access_code_events.access_code_id ON DELETE CASCADE`
  --    auto-removes the audit-log rows as part of this single statement.
  delete from public.access_codes where id = p_access_code_id;
end;
$$;

comment on function public.hard_delete_access_code(uuid, text) is
  'Admin-only. Atomically hard-deletes an access code + its events. '
  'Refuses codes bound to a still-active (non-soft-deleted) trainer. '
  'Requires the exact code value as confirmation.';
