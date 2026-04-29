-- Adds the free-form note the client writes for the trainer. Surfaced
-- on the single-page client portal (profile section) and on the
-- trainer's client detail page as a quoted callout.
alter table public.clients add column if not exists note_to_trainer text;
