/**
 * Schema migration: replace packages.session_type with delivery_method,
 * add sessions.in_app_origin, add subscriptions.status + partial unique
 * index. Idempotent — re-running is safe.
 *
 * Run once after deploying. The Supabase Management API "query"
 * endpoint runs each `query` body in a single statement, so we send
 * them sequentially here.
 */

// Mark as a module so top-level identifiers don't collide with sibling
// scripts under `tsc --noEmit` (isolatedModules requires modules).
export {};

const PAT = process.env.SUPABASE_ACCESS_TOKEN ?? (() => {
  throw new Error("SUPABASE_ACCESS_TOKEN env var is required to run this script");
})();
const PROJECT = process.env.SUPABASE_PROJECT_REF ?? "rcjuqgvvpnjzifrvvsbq";

async function runSql(sql: string, attempt = 0): Promise<unknown[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if ((res.status >= 500 || res.status === 429) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    return runSql(sql, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL error (${res.status}): ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

const steps: Array<[label: string, sql: string]> = [
  // ── packages.delivery_method ────────────────────────────────────────
  ["packages: add delivery_method column", "alter table public.packages add column if not exists delivery_method text;"],
  ["packages: backfill delivery_method", "update public.packages set delivery_method = case when session_type = 'zoom' then 'online' else 'in_person' end where delivery_method is null;"],
  ["packages: not null", "alter table public.packages alter column delivery_method set not null;"],
  ["packages: default", "alter table public.packages alter column delivery_method set default 'in_person';"],
  ["packages: drop old delivery_method check (if any)", "alter table public.packages drop constraint if exists packages_delivery_method_check;"],
  ["packages: add new delivery_method check", "alter table public.packages add constraint packages_delivery_method_check check (delivery_method in ('in_person','online'));"],
  ["packages: drop legacy session_type check", "alter table public.packages drop constraint if exists packages_session_type_check;"],
  ["packages: drop legacy session_type column", "alter table public.packages drop column if exists session_type;"],

  // ── sessions.in_app_origin ──────────────────────────────────────────
  ["sessions: add in_app_origin column", "alter table public.sessions add column if not exists in_app_origin text;"],
  ["sessions: drop legacy origin check", "alter table public.sessions drop constraint if exists sessions_in_app_origin_check;"],
  ["sessions: add origin check", "alter table public.sessions add constraint sessions_in_app_origin_check check (in_app_origin in ('trainer_pushed','client_requested') or in_app_origin is null);"],
  ["sessions: backfill origin (existing in_app → trainer_pushed)", "update public.sessions set in_app_origin = 'trainer_pushed' where session_type = 'in_app' and in_app_origin is null;"],

  // ── subscriptions.status + partial unique index ─────────────────────
  ["subscriptions: add status column", "alter table public.subscriptions add column if not exists status text;"],
  ["subscriptions: backfill status",
    `update public.subscriptions set status = case
       when payment_status = 'pending' then 'pending'
       when payment_status = 'paid' and (end_date is null or end_date >= current_date) and sessions_remaining > 0 then 'active'
       else 'expired'
     end where status is null;`],
  ["subscriptions: not null", "alter table public.subscriptions alter column status set not null;"],
  ["subscriptions: default", "alter table public.subscriptions alter column status set default 'pending';"],
  ["subscriptions: drop legacy status check", "alter table public.subscriptions drop constraint if exists subscriptions_status_check;"],
  ["subscriptions: add status check", "alter table public.subscriptions add constraint subscriptions_status_check check (status in ('active','pending','expired','cancelled'));"],
  ["subscriptions: one active per client (partial unique index)", "create unique index if not exists subscriptions_one_active_per_client on public.subscriptions (client_id) where status = 'active';"],
];

async function main() {
  for (const [label, sql] of steps) {
    try {
      await runSql(sql);
      console.log(`✓ ${label}`);
    } catch (err) {
      console.error(`✗ ${label}`);
      throw err;
    }
  }
  console.log("\n✓ migration complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
