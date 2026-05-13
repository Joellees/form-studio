-- `packages.description` — optional rich-ish text that the trainer
-- writes per package, surfaced to clients on the public storefront
-- below the package title.
--
-- Replaces the previous `session_type_mix` badge ("strength" /
-- "strength + mobility") which the trainer found wasn't carrying
-- enough information for client-facing pages. The session_type_mix
-- column stays in the table for now — existing rows keep their value,
-- and dropping it can be a separate migration once we've confirmed no
-- internal reports rely on it.
--
-- `text` not `varchar` so trainers aren't surprised by silent
-- truncation. `add column if not exists` makes the migration safe to
-- re-apply. App reads of `description` are column-missing-tolerant
-- (the form's save action has a retry-without-description fallback
-- and the storefront read uses a try-wide-then-narrow pattern) so
-- the migration can land before OR after the matching code deploy.

alter table public.packages
  add column if not exists description text;

comment on column public.packages.description is
  'Optional trainer-written description shown on the public storefront under each package. Replaces the session_type_mix badge as the human-readable summary.';
