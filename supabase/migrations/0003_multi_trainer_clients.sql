-- Allow one Clerk user to be a client of multiple trainers.
--
-- Each row in `clients` is a membership in ONE trainer's studio. Before
-- this migration, `clerk_id text unique` capped a Clerk user to a
-- single trainer; we now scope uniqueness to (tenant_id, clerk_id) so
-- the same user can join Rand's, Laurent's, and any other studio they
-- get an invite to. Each row keeps its own profile + calendar; the
-- portal switches between them via the active subdomain or a cookie.

alter table public.clients drop constraint if exists clients_clerk_id_key;

create unique index if not exists clients_tenant_clerk_unique
  on public.clients (tenant_id, clerk_id)
  where clerk_id is not null;
