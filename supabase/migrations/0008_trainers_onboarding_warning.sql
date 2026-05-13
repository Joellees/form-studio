-- `trainers.onboarding_warning` — surface text for non-fatal failures
-- in the onboarding / access-code-bind flow.
--
-- Background:
--   `bindAccessCodeOnOnboarding` (src/app/beta/actions.ts) silently
--   early-returns in several cases — wrong-owner, missing cookie, bad
--   code, revoked code. Pre-2026-05-13 the result was that the trainer
--   row stayed at the hardcoded `subscription_status='expired'` /
--   `cohort=null` defaults from the insert, and the studio layout's
--   subscription gate would dump the trainer on /studio/expired with
--   the wrong cohort defaults (Beta-2 plan cards shown even when their
--   code was a Beta-1 founding code). Real users hit this when the
--   prod Clerk instance reissued user_* IDs.
--
-- Fix:
--   When the bind step can't complete, set this column to a short
--   human-readable explanation. The studio layout reads it and shows
--   a dedicated /studio/onboarding-issue surface (message-support CTA)
--   instead of falling through to the cohort-default expired page.
--
-- On successful bind, this column is cleared to null.
--
-- Nullable, no default — absence == "no warning" == normal flow.

alter table public.trainers
  add column if not exists onboarding_warning text;

comment on column public.trainers.onboarding_warning is
  'Non-null when the access-code bind step failed in a recoverable way. The studio layout surfaces this to the trainer with a support CTA rather than treating them as expired.';
