/**
 * Add a couple of "client-requested extra in-app workouts" to Joelle's
 * tenant so the trainer dashboard + client portal demo the $3 flow.
 * Idempotent: skips if any client_requested session already exists.
 *
 * Run:
 *   SUPABASE_ACCESS_TOKEN=sbp_… npx tsx scripts/seed-extra-inapp-demo.ts
 */

// Mark as a module so top-level identifiers don't collide with sibling
// scripts under `tsc --noEmit`.
export {};

const PAT = process.env.SUPABASE_ACCESS_TOKEN ?? (() => {
  throw new Error("SUPABASE_ACCESS_TOKEN env var is required to run this script");
})();
const PROJECT = process.env.SUPABASE_PROJECT_REF ?? "rcjuqgvvpnjzifrvvsbq";
const TENANT_SLUG = "joelle";

async function runSql<T = Record<string, unknown>>(sql: string, attempt = 0): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if ((res.status >= 500 || res.status === 429) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    return runSql<T>(sql, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T[];
}

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return "null";
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function main() {
  // Resolve tenant.
  const tenantRows = await runSql<{ id: string }>(
    `select id from public.trainers where subdomain_slug = ${esc(TENANT_SLUG)} limit 1;`,
  );
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error(`Tenant '${TENANT_SLUG}' not found`);
  console.log(`tenant: ${tenantId}`);

  // Bail if there's already at least one client_requested in-app session.
  const existing = await runSql<{ count: string }>(
    `select count(*)::text as count from public.sessions
     where tenant_id = ${esc(tenantId)} and session_type = 'in_app' and in_app_origin = 'client_requested';`,
  );
  if (Number(existing[0]?.count ?? "0") > 0) {
    console.log(`already seeded: ${existing[0]?.count} client_requested session(s) found, skipping`);
    return;
  }

  // Pick 2 active clients to attach the demo to.
  const clients = await runSql<{ id: string; display_name: string }>(
    `select id, display_name from public.clients
     where tenant_id = ${esc(tenantId)} and active = true
     order by created_at limit 2;`,
  );
  if (clients.length < 2) {
    console.log("not enough active clients to seed demo");
    return;
  }

  // 1) pending request (trainer hasn't approved yet) — appears in
  //    action feed as an "extra in-app workout" item.
  {
    const c = clients[0]!;
    const when = new Date();
    when.setDate(when.getDate() + 3);
    when.setHours(17, 0, 0, 0);
    const sess = await runSql<{ id: string }>(
      `insert into public.sessions (tenant_id, client_id, scheduled_at, duration_minutes, session_type, in_app_origin, in_app_surcharge_paid, status, notes)
       values (${esc(tenantId)}, ${esc(c.id)}, ${esc(when.toISOString())}, 60, 'in_app', 'client_requested', false, 'requested',
               ${esc("Extra upper-body workout? Travelling thurs-sun.")})
       returning id;`,
    );
    const sid = sess[0]!.id;
    await runSql(
      `insert into public.payments (tenant_id, subscription_id, session_id, amount_usd, method, status)
       values (${esc(tenantId)}, null, ${esc(sid)}, 3, 'manual', 'pending');`,
    );
    console.log(`+ pending client_requested for ${c.display_name} (session ${sid.slice(0, 8)})`);
  }

  // 2) approved + paid — represents an extra workout the trainer has
  //    accepted and the client has paid for (visible on calendar with
  //    a +$3 badge).
  {
    const c = clients[1]!;
    const when = new Date();
    when.setDate(when.getDate() + 5);
    when.setHours(8, 30, 0, 0);
    const sess = await runSql<{ id: string }>(
      `insert into public.sessions (tenant_id, client_id, scheduled_at, duration_minutes, session_type, in_app_origin, in_app_surcharge_paid, status, name)
       values (${esc(tenantId)}, ${esc(c.id)}, ${esc(when.toISOString())}, 60, 'in_app', 'client_requested', true, 'scheduled',
               ${esc("Extra mobility flow")})
       returning id;`,
    );
    const sid = sess[0]!.id;
    await runSql(
      `insert into public.payments (tenant_id, subscription_id, session_id, amount_usd, method, status)
       values (${esc(tenantId)}, null, ${esc(sid)}, 3, 'manual', 'paid');`,
    );
    console.log(`+ approved+paid client_requested for ${c.display_name} (session ${sid.slice(0, 8)})`);
  }

  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
