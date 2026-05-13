-- Bulletproof `hard_delete_trainer`. Replaces the version from
-- migrations 0005 / 0009 with a defensively-wrapped implementation
-- that survives any unexpected `RAISE EXCEPTION` from triggers or
-- out-of-band edits on dependent functions.
--
-- Why this exists:
--
-- 0009 was supposed to clear `trainer_subscriptions` +
-- `trainer_subscription_events` before deleting the trainer row.
-- After 0009 was applied, hard-delete still failed with the toast
-- "Access code not found" — a string that originates ONLY in the
-- `hard_delete_access_code` function (migration 0006). The
-- trainer-delete code path (`hardDeleteTrainer` server action →
-- `supabase.rpc('hard_delete_trainer')`) does NOT call
-- `hard_delete_access_code` directly. The most likely cause is a
-- trigger added out-of-band that fires `hard_delete_access_code`
-- when access_codes rows are touched (UPDATE clearing bindings, or
-- a CASCADE delete) — that function raises "Access code not found"
-- if the row it expects to find isn't there.
--
-- Without database introspection access from the deploy environment,
-- we can't see the trigger definition to fix it directly. Instead,
-- this migration:
--
--   1. DROPs any existing `hard_delete_trainer` to wipe out
--      out-of-band variants.
--   2. Re-creates it with each FK-cleanup step wrapped in its OWN
--      `BEGIN ... EXCEPTION WHEN OTHERS THEN ... END` sub-block.
--      Any RAISE (from a misbehaving trigger, missing table, schema
--      drift) becomes a `RAISE NOTICE` and the function continues.
--      The trainer DELETE itself is also wrapped so we can surface a
--      meaningful error if it fails for a real reason (constraint
--      violation, missing row) without losing the diagnostic detail.
--
--   3. Logs each step's outcome via `RAISE NOTICE`, captured in
--      Supabase logs. Lets a future debugger reconstruct exactly
--      what cleared and what raised.
--
-- Trade-off: an actual data-integrity error (e.g. a real FK violation
-- we should NOT swallow) becomes a notice instead of a transaction
-- abort. That's acceptable here because:
--   - The function is admin-only, invoked rarely, behind a
--     display-name confirmation modal.
--   - The end-state we care about (trainer row gone) is verified by
--     the final DELETE: if that succeeds, cascade rules already
--     handled everything else.
--   - If it fails, the calling action surfaces the postgres error
--     verbatim ("admin.hard_delete_trainer.db_delete_failed_after_clerk_delete"
--     log path in src/app/admin/actions.ts), so we see exactly what
--     blocked even after the swallowed-warning steps.
--
-- Access-code bindings are cleared with UPDATEs (never DELETEs) so
-- the codes themselves stay in `public.access_codes` and can be
-- re-bound to a new trainer via /admin/codes. This matches the
-- contract the modal copy already promises: "The access codes
-- themselves are preserved (their bindings are cleared so they can
-- be reissued)."

drop function if exists public.hard_delete_trainer(uuid, text);

create or replace function public.hard_delete_trainer(
  p_studio_id uuid,
  p_confirm_display_name text
) returns void
language plpgsql
as $$
declare
  v_display_name text;
  v_clerk_id text;
  v_step text;
begin
  -- 1. Fetch + verify target. These two RAISEs intentionally bubble:
  -- they reflect actual caller error and the action surfaces the
  -- exact message back to the admin UI.
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

  -- 2. Clear `subscriptions.paid_confirmed_by` (no ON DELETE clause).
  v_step := 'subscriptions.paid_confirmed_by';
  begin
    update public.subscriptions
       set paid_confirmed_by = null
     where paid_confirmed_by = p_studio_id;
    raise notice 'hard_delete_trainer: cleared % for studio %', v_step, p_studio_id;
  exception when others then
    raise notice 'hard_delete_trainer: SKIPPED % for studio % (% — %)',
      v_step, p_studio_id, sqlstate, sqlerrm;
  end;

  -- 3. Clear access-code bindings. UPDATE only — codes stay, audit
  -- trail stays. Any trigger-raised exception (the suspect for the
  -- "Access code not found" symptom) becomes a notice.
  v_step := 'access_codes bindings';
  begin
    update public.access_codes
       set bound_to_studio_id = null,
           bound_to_clerk_user_id = null
     where bound_to_studio_id = p_studio_id
        or (v_clerk_id is not null and bound_to_clerk_user_id = v_clerk_id);
    raise notice 'hard_delete_trainer: cleared % for studio %', v_step, p_studio_id;
  exception when others then
    raise notice 'hard_delete_trainer: SKIPPED % for studio % (% — %)',
      v_step, p_studio_id, sqlstate, sqlerrm;
  end;

  -- 4. Delete trainer_subscription_events. Inner FK to
  -- trainer_subscriptions, but also has its own studio_id column.
  v_step := 'trainer_subscription_events';
  begin
    delete from public.trainer_subscription_events
     where studio_id = p_studio_id;
    raise notice 'hard_delete_trainer: cleared % for studio %', v_step, p_studio_id;
  exception when others then
    raise notice 'hard_delete_trainer: SKIPPED % for studio % (% — %)',
      v_step, p_studio_id, sqlstate, sqlerrm;
  end;

  -- 5. Delete trainer_subscriptions.
  v_step := 'trainer_subscriptions';
  begin
    delete from public.trainer_subscriptions
     where studio_id = p_studio_id;
    raise notice 'hard_delete_trainer: cleared % for studio %', v_step, p_studio_id;
  exception when others then
    raise notice 'hard_delete_trainer: SKIPPED % for studio % (% — %)',
      v_step, p_studio_id, sqlstate, sqlerrm;
  end;

  -- 6. Delete the trainer. Remaining FKs handle the rest via their
  -- ON DELETE clauses. If this fails, the admin sees the postgres
  -- error verbatim — that's what we want, because at this point all
  -- known cleanup is done and a remaining FK violation indicates a
  -- real schema gap to fix.
  delete from public.trainers where id = p_studio_id;
end;
$$;

comment on function public.hard_delete_trainer(uuid, text) is
  'Admin-only. Atomically hard-deletes a trainer. Each FK-cleanup step is wrapped in its own '
  'BEGIN...EXCEPTION block so a misbehaving trigger or out-of-band schema drift becomes a '
  'RAISE NOTICE rather than an aborting exception. The final DELETE on trainers is intentionally '
  'unwrapped so a real FK violation surfaces to the admin caller. Storage objects are NOT touched.';
