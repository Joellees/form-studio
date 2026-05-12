-- `is_access_code_valid(p_code)` — callable by the anon role from
-- Next.js Edge middleware to validate the `fs_beta` cookie against
-- the live `access_codes` table.
--
-- Why a SECURITY DEFINER function instead of a direct SELECT:
--
-- `public.access_codes` has RLS enabled with a deny-all SELECT policy
-- (`access_codes_no_select`). Service-role-backed paths (admin client,
-- /beta redemption) bypass RLS; middleware runs in the Edge runtime
-- with the public anon key, which RLS would block.
--
-- Granting anon SELECT on the table would let any visitor enumerate
-- every code string by hitting `/rest/v1/access_codes?select=code`.
-- The codes are short and partly predictable (B2-001, B2-002, …),
-- so enumeration is a real risk. A SECURITY DEFINER function takes
-- the code as input and returns only `true`/`false` — anon can check
-- specific values but cannot list them.
--
-- Validity == row exists AND not revoked. Case-insensitive match to
-- mirror the redemption flow's `.ilike(code, …)`. Bound-trainer's
-- soft-delete state is intentionally NOT considered here — soft-
-- deleted trainers can be restored without invalidating their access
-- code, and middleware shouldn't bounce a returning trainer in the
-- soft-delete window.
--
-- Called from:
--   - `src/middleware.ts` beta-gate check (this is the only caller)
--
-- Pre-existing /beta page logic (`src/app/beta/page.tsx`) still
-- queries the table directly via the admin client — kept consistent
-- by sharing the same validity definition.

create or replace function public.is_access_code_valid(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.access_codes
     where lower(code) = lower(p_code)
       and not revoked
  );
$$;

-- Tighten function privileges:
--   - Revoke the default `execute to public` so we control access.
--   - Grant to `anon` (edge middleware) and `authenticated` (server
--     components that might use the same path in future).
revoke all on function public.is_access_code_valid(text) from public;
grant execute on function public.is_access_code_valid(text) to anon;
grant execute on function public.is_access_code_valid(text) to authenticated;

comment on function public.is_access_code_valid(text) is
  'Edge-middleware-safe access-code validator. Returns true if a non-revoked code matching the input exists. Anon-callable; bypasses RLS via SECURITY DEFINER. Does not expose code values.';
