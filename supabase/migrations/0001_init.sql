-- ─────────────────────────────────────────────────────────────────────────
-- Form Studio — initial schema
--
-- Identity is Clerk. Every user-bound row stores its owning Clerk ID.
-- RLS is the source of truth for access control. App code must never
-- bypass it except via the service role (server-only, trusted paths).
--
-- The Clerk-issued JWT is injected by the Supabase client library; its
-- `sub` claim carries the Clerk user ID. We read it via `auth.jwt()->>'sub'`.
--
-- Safe to run on an empty or already-migrated project — the header below
-- resets the public schema first so partial state from failed runs is
-- cleaned up.
-- ─────────────────────────────────────────────────────────────────────────

-- Reset: drop every application object so reruns are idempotent. Storage
-- and auth schemas are untouched because Supabase manages them.
drop schema if exists public cascade;
create schema public;

-- Restore the grants Supabase normally provisions out of the box. Without
-- these, PostgREST requests from anon/authenticated/service_role get
-- 42501 permission-denied before RLS is even consulted.
grant usage on schema public to anon, authenticated, service_role;
grant create on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;

create extension if not exists "pgcrypto" with schema public;
create extension if not exists "citext"   with schema public;

-- ─── zero-dependency helpers ─────────────────────────────────────────────

create or replace function public.current_clerk_id() returns text
language sql stable security definer as $$
  select nullif(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'sub',
    (auth.jwt() ->> 'sub')
  ), '')
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- ─── super_admins (no deps) ──────────────────────────────────────────────

create table public.super_admins (
  clerk_id text primary key,
  created_at timestamptz not null default now()
);

alter table public.super_admins enable row level security;
create policy super_admins_read_self on public.super_admins
  for select using (clerk_id = public.current_clerk_id());

create or replace function public.is_super_admin() returns boolean
language sql stable security definer as $$
  select exists (select 1 from public.super_admins where clerk_id = public.current_clerk_id())
$$;

-- ─── trainers (FK target for most other tables) ──────────────────────────

create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  subdomain_slug citext unique not null,
  display_name text not null,
  email citext,
  bio text,
  cover_image_url text,
  profile_image_url text,
  accent_color_override text,
  timezone text not null default 'UTC',
  locale text not null default 'en',
  subscription_status text not null default 'trialing',
  subscription_tier text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index trainers_slug_idx on public.trainers (subdomain_slug);

create trigger trainers_touch before update on public.trainers
  for each row execute function public.touch_updated_at();

alter table public.trainers enable row level security;

create or replace function public.current_trainer_id() returns uuid
language sql stable security definer as $$
  select id from public.trainers where clerk_id = public.current_clerk_id() limit 1
$$;

-- Trainer-self policies can be added immediately. Cross-role policies
-- that depend on current_client_tenant() are added after clients exists.
create policy trainers_self_read on public.trainers
  for select using (clerk_id = public.current_clerk_id() or public.is_super_admin());
create policy trainers_self_update on public.trainers
  for update using (clerk_id = public.current_clerk_id())
  with check (clerk_id = public.current_clerk_id());
create policy trainers_super_admin_all on public.trainers
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ─── clients (FK to trainers) ────────────────────────────────────────────

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  clerk_id text unique,
  display_name text not null,
  email citext,
  phone text,
  timezone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_tenant_idx on public.clients (tenant_id);

create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

alter table public.clients enable row level security;

create or replace function public.current_client_id() returns uuid
language sql stable security definer as $$
  select id from public.clients where clerk_id = public.current_clerk_id() limit 1
$$;

create or replace function public.current_client_tenant() returns uuid
language sql stable security definer as $$
  select tenant_id from public.clients where clerk_id = public.current_clerk_id() limit 1
$$;

-- Now that clients + current_client_tenant exist, add the remaining
-- cross-role policy on trainers, plus all policies on clients.
create policy trainers_client_read_own on public.trainers
  for select using (id = public.current_client_tenant());

create policy clients_trainer_access on public.clients
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy clients_self_read on public.clients
  for select using (clerk_id = public.current_clerk_id());
create policy clients_self_update on public.clients
  for update using (clerk_id = public.current_clerk_id())
  with check (clerk_id = public.current_clerk_id());

-- Public marketing view — minimal fields exposed to anonymous callers.
create or replace view public.trainer_public as
  select id, subdomain_slug, display_name, bio, cover_image_url, profile_image_url, accent_color_override
  from public.trainers
  where archived_at is null;

grant select on public.trainer_public to anon, authenticated;

-- ─── client_profile_fields ───────────────────────────────────────────────

create table public.client_profile_fields (
  client_id uuid primary key references public.clients(id) on delete cascade,
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  cycle boolean not null default false,
  weight boolean not null default true,
  measurements boolean not null default false,
  progress_photos boolean not null default false,
  mood boolean not null default false,
  sleep boolean not null default false,
  prs boolean not null default false,
  custom_fields jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger client_fields_touch before update on public.client_profile_fields
  for each row execute function public.touch_updated_at();

alter table public.client_profile_fields enable row level security;
create policy cpf_trainer_access on public.client_profile_fields
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy cpf_client_read on public.client_profile_fields
  for select using (client_id = public.current_client_id());

-- ─── packages ────────────────────────────────────────────────────────────

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  name text not null,
  session_type_mix text not null default 'strength',
  session_count integer not null check (session_count > 0),
  duration_days integer not null check (duration_days > 0),
  price_usd numeric(10, 2) not null check (price_usd >= 0),
  payment_mode text not null default 'manual' check (payment_mode in ('manual', 'online')),
  cancellation_policy text not null default 'credited' check (cancellation_policy in ('credited', 'lost')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index packages_tenant_idx on public.packages (tenant_id) where active;
create trigger packages_touch before update on public.packages
  for each row execute function public.touch_updated_at();

alter table public.packages enable row level security;
create policy packages_trainer_access on public.packages
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy packages_client_read on public.packages
  for select using (tenant_id = public.current_client_tenant() and active);
create policy packages_public_read on public.packages
  for select to anon using (active);

-- ─── subscriptions ───────────────────────────────────────────────────────

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete restrict,
  start_date date,
  end_date date,
  sessions_remaining integer not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  payment_method text not null default 'manual' check (payment_method in ('manual', 'stripe', 'tap')),
  stripe_payment_intent_id text,
  paid_confirmed_at timestamptz,
  paid_confirmed_by uuid references public.trainers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_tenant_idx on public.subscriptions (tenant_id);
create index subscriptions_client_idx on public.subscriptions (client_id);
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;
create policy subscriptions_trainer_access on public.subscriptions
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy subscriptions_client_read on public.subscriptions
  for select using (client_id = public.current_client_id());

-- ─── exercises ───────────────────────────────────────────────────────────

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  name text not null,
  default_descriptor text,
  group_tag text,
  video_url text,
  thumbnail_url text,
  equipment text,
  is_unilateral boolean not null default false,
  default_rest_seconds integer,
  trainer_notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exercises_tenant_idx on public.exercises (tenant_id) where not archived;
create index exercises_group_idx on public.exercises (tenant_id, group_tag) where not archived;
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

alter table public.exercises enable row level security;
create policy exercises_trainer_access on public.exercises
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy exercises_client_read on public.exercises
  for select using (tenant_id = public.current_client_tenant() and not archived);

-- ─── session_templates + children ────────────────────────────────────────

create table public.session_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  name text not null,
  day_label text,
  description text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_templates_tenant_idx on public.session_templates (tenant_id) where not archived;
create trigger templates_touch before update on public.session_templates
  for each row execute function public.touch_updated_at();

alter table public.session_templates enable row level security;
create policy templates_trainer_access on public.session_templates
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());

create table public.template_blocks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.session_templates(id) on delete cascade,
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  order_index integer not null,
  round_label text,
  round_count integer not null default 1,
  round_rest_seconds integer
);
create index template_blocks_parent_idx on public.template_blocks (template_id);
alter table public.template_blocks enable row level security;
create policy template_blocks_trainer on public.template_blocks
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());

create table public.template_block_exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.template_blocks(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  order_index integer not null,
  setup_override text
);
create index template_block_exercises_parent_idx on public.template_block_exercises (block_id);
alter table public.template_block_exercises enable row level security;
create policy template_block_ex_trainer on public.template_block_exercises
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());

create table public.template_set_groups (
  id uuid primary key default gen_random_uuid(),
  block_exercise_id uuid not null references public.template_block_exercises(id) on delete cascade,
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  order_index integer not null,
  label text,
  sets integer not null default 1 check (sets > 0),
  rep_type text not null check (rep_type in ('fixed', 'range', 'unilateral', 'total', 'time', 'distance', 'amrap', 'emom', 'single')),
  rep_value jsonb not null default '{}'::jsonb,
  weight_type text not null check (weight_type in ('load', 'bw', 'percentage', 'intensity', 'blank')),
  weight_value jsonb not null default '{}'::jsonb,
  rest_seconds integer,
  intent_tag text
);
create index template_set_groups_parent_idx on public.template_set_groups (block_exercise_id);
alter table public.template_set_groups enable row level security;
create policy template_set_groups_trainer on public.template_set_groups
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());

-- ─── sessions + children ─────────────────────────────────────────────────

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  source_template_id uuid references public.session_templates(id) on delete set null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  session_type text not null check (session_type in ('in_person', 'zoom', 'in_app')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'requested', 'declined')),
  name text,
  day_label text,
  notes text,
  zoom_url text,
  in_app_surcharge_paid boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_tenant_idx on public.sessions (tenant_id, scheduled_at);
create index sessions_client_idx on public.sessions (client_id, scheduled_at);
create index sessions_status_idx on public.sessions (tenant_id, status);
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();

alter table public.sessions enable row level security;
create policy sessions_trainer_access on public.sessions
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy sessions_client_read on public.sessions
  for select using (client_id = public.current_client_id());
create policy sessions_client_request on public.sessions
  for insert with check (client_id = public.current_client_id() and status = 'requested');
create policy sessions_client_cancel on public.sessions
  for update using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

create table public.session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  order_index integer not null,
  round_label text,
  round_count integer not null default 1,
  round_rest_seconds integer
);
create index session_blocks_parent_idx on public.session_blocks (session_id);
alter table public.session_blocks enable row level security;
create policy session_blocks_trainer on public.session_blocks
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy session_blocks_client_read on public.session_blocks
  for select using (session_id in (select id from public.sessions where client_id = public.current_client_id()));

create table public.session_block_exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.session_blocks(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  order_index integer not null,
  setup_override text
);
create index session_block_exercises_parent_idx on public.session_block_exercises (block_id);
alter table public.session_block_exercises enable row level security;
create policy session_block_ex_trainer on public.session_block_exercises
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy session_block_ex_client_read on public.session_block_exercises
  for select using (block_id in (
    select b.id from public.session_blocks b
    join public.sessions s on s.id = b.session_id
    where s.client_id = public.current_client_id()
  ));

create table public.session_set_groups (
  id uuid primary key default gen_random_uuid(),
  block_exercise_id uuid not null references public.session_block_exercises(id) on delete cascade,
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  order_index integer not null,
  label text,
  sets integer not null default 1,
  rep_type text not null check (rep_type in ('fixed', 'range', 'unilateral', 'total', 'time', 'distance', 'amrap', 'emom', 'single')),
  rep_value jsonb not null default '{}'::jsonb,
  weight_type text not null check (weight_type in ('load', 'bw', 'percentage', 'intensity', 'blank')),
  weight_value jsonb not null default '{}'::jsonb,
  rest_seconds integer,
  intent_tag text,
  performed_sets integer,
  performed_reps jsonb,
  performed_weight jsonb,
  performed_notes text
);
create index session_set_groups_parent_idx on public.session_set_groups (block_exercise_id);
alter table public.session_set_groups enable row level security;
create policy session_set_groups_trainer on public.session_set_groups
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy session_set_groups_client_read on public.session_set_groups
  for select using (block_exercise_id in (
    select be.id from public.session_block_exercises be
    join public.session_blocks b on b.id = be.block_id
    join public.sessions s on s.id = b.session_id
    where s.client_id = public.current_client_id()
  ));
create policy session_set_groups_client_log on public.session_set_groups
  for update using (block_exercise_id in (
    select be.id from public.session_block_exercises be
    join public.session_blocks b on b.id = be.block_id
    join public.sessions s on s.id = b.session_id
    where s.client_id = public.current_client_id() and s.session_type = 'in_app'
  ));

-- ─── client_logs ─────────────────────────────────────────────────────────

create table public.client_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  logged_at timestamptz not null default now(),
  field_type text not null check (field_type in ('cycle', 'weight', 'measurements', 'progress_photo', 'mood', 'sleep', 'pr', 'custom')),
  value jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index client_logs_tenant_idx on public.client_logs (tenant_id, client_id, logged_at desc);
alter table public.client_logs enable row level security;
create policy client_logs_trainer on public.client_logs
  for select using (tenant_id = public.current_trainer_id());
create policy client_logs_self_all on public.client_logs
  for all using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- ─── cancellations ───────────────────────────────────────────────────────

create table public.cancellations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  cancelled_by text not null check (cancelled_by in ('trainer', 'client')),
  cancelled_at timestamptz not null default now(),
  reason text,
  credit_restored boolean not null default true
);
create index cancellations_tenant_idx on public.cancellations (tenant_id);
alter table public.cancellations enable row level security;
create policy cancellations_trainer on public.cancellations
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy cancellations_client_read on public.cancellations
  for select using (session_id in (select id from public.sessions where client_id = public.current_client_id()));

-- ─── payments ────────────────────────────────────────────────────────────

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.trainers(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  amount_usd numeric(10, 2) not null,
  method text not null check (method in ('manual', 'stripe', 'tap')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_tenant_idx on public.payments (tenant_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
alter table public.payments enable row level security;
create policy payments_trainer on public.payments
  for all using (tenant_id = public.current_trainer_id())
  with check (tenant_id = public.current_trainer_id());
create policy payments_client_read on public.payments
  for select using (
    subscription_id in (select id from public.subscriptions where client_id = public.current_client_id())
    or session_id in (select id from public.sessions where client_id = public.current_client_id())
  );

-- ─── platform_subscriptions (Phase 2) ────────────────────────────────────

create table public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  tier text not null,
  status text not null,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger platform_subs_touch before update on public.platform_subscriptions
  for each row execute function public.touch_updated_at();
alter table public.platform_subscriptions enable row level security;
create policy platform_subs_trainer on public.platform_subscriptions
  for select using (trainer_id = public.current_trainer_id());
create policy platform_subs_admin on public.platform_subscriptions
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ─── Storage buckets + RLS ───────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('exercise-videos', 'exercise-videos', false, 209715200, array['video/mp4','video/quicktime','video/webm']),
  ('exercise-thumbs', 'exercise-thumbs', true,   5242880,  array['image/jpeg','image/png','image/webp']),
  ('trainer-assets', 'trainer-assets',   true,  10485760,  array['image/jpeg','image/png','image/webp','image/avif']),
  ('client-progress','client-progress',  false, 15728640,  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Path convention: "{tenant_id}/{child_id}/{filename}"
drop policy if exists "videos_trainer_rw"        on storage.objects;
drop policy if exists "videos_client_read"       on storage.objects;
drop policy if exists "trainer_assets_rw"        on storage.objects;
drop policy if exists "client_progress_self"     on storage.objects;
drop policy if exists "client_progress_trainer_read" on storage.objects;

create policy "videos_trainer_rw" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1]::uuid = public.current_trainer_id()
  )
  with check (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1]::uuid = public.current_trainer_id()
  );

create policy "videos_client_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1]::uuid = public.current_client_tenant()
  );

create policy "trainer_assets_rw" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'trainer-assets'
    and (storage.foldername(name))[1]::uuid = public.current_trainer_id()
  )
  with check (
    bucket_id = 'trainer-assets'
    and (storage.foldername(name))[1]::uuid = public.current_trainer_id()
  );

create policy "client_progress_self" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'client-progress'
    and (storage.foldername(name))[1]::uuid = public.current_client_id()
  )
  with check (
    bucket_id = 'client-progress'
    and (storage.foldername(name))[1]::uuid = public.current_client_id()
  );

create policy "client_progress_trainer_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-progress'
    and (storage.foldername(name))[2]::uuid = public.current_trainer_id()
  );

-- ─── Grants on existing objects ──────────────────────────────────────────
-- default_privileges only applies to FUTURE objects; everything above was
-- created in this transaction, so grant explicitly. RLS still gates per
-- row for anon/authenticated; service_role has BYPASSRLS so it sees all.

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
