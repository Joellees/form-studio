/**
 * Seed the joelle-owner test studio with realistic mockup data so the
 * full app can be navigated like a real trainer's account, not stared
 * at through empty states. Idempotent — re-running skips anything
 * that already exists by stable name/identifier.
 *
 * Run:
 *   SUPABASE_ACCESS_TOKEN=sbp_… npx tsx scripts/seed-joelle.ts
 *
 * Touches ONLY Joelle's tenant. Does not modify Johnny or Laurent.
 */

// Mark as a module so top-level identifiers don't collide with sibling
// scripts under `tsc --noEmit` (isolatedModules requires modules).
export {};

const PAT = process.env.SUPABASE_ACCESS_TOKEN ?? "sbp_f81b12d01ff9deae96a1e08257f3653ee1b46691";
const PROJECT = process.env.SUPABASE_PROJECT_REF ?? "rcjuqgvvpnjzifrvvsbq";
const TENANT_SLUG = "joelle";

async function runSql<T = Record<string, unknown>>(sql: string, attempt = 0): Promise<T[]> {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if ((res.status >= 500 || res.status === 429) && attempt < 5) {
      const delay = 800 * 2 ** attempt + Math.random() * 400;
      await new Promise((r) => setTimeout(r, delay));
      return runSql<T>(sql, attempt + 1);
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`SQL error (${res.status}): ${text.slice(0, 400)}`);
    return JSON.parse(text) as T[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const transient =
      msg.includes("fetch failed") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ENETUNREACH");
    if (transient && attempt < 5) {
      const delay = 800 * 2 ** attempt + Math.random() * 400;
      await new Promise((r) => setTimeout(r, delay));
      return runSql<T>(sql, attempt + 1);
    }
    throw err;
  }
}

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return "null";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function jsonb(v: unknown): string {
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length] as T;
}

// ─── Plan ────────────────────────────────────────────────────────────────

type ClientSpec = {
  name: string;
  email: string;
  phone: string;
  goals: string | null;
  injuries: string | null;
  notes: string | null;
  noteToTrainer: string | null;
  // Subscription state — drives sessions remaining + dates.
  state:
    | "active_mid"        // active, mid-package
    | "active_renewing"   // active, sub ending in <7 days
    | "pending_payment"   // sub awaiting payment confirmation
    | "expired"           // last sub already ended, no current
    | "active_existing";  // already has a sub seeded, leave alone
  // Which log fields are toggled on for this client.
  fields: Partial<{
    weight: boolean;
    cycle: boolean;
    measurements: boolean;
    mood: boolean;
    sleep: boolean;
    prs: boolean;
    progress_photos: boolean;
  }>;
};

// 8 NEW clients to add. The 4 existing rows (Joanne, Rand, Leila, Joelle)
// stay; this list only describes additions and the state we want each
// to be in for the seed.
const NEW_CLIENTS: ClientSpec[] = [
  {
    name: "Layla Aoun",
    email: "layla.aoun+seed@example.com",
    phone: "+961 70 100 011",
    goals: "Hit a bodyweight back squat by end of summer. Stay consistent through travel weeks.",
    injuries: "Mild left knee sensitivity in deep squats — keep depth controlled.",
    notes: "Mornings only; can&apos;t train Wednesdays.",
    noteToTrainer: "Sleeping better since we cut the late workouts. Thank you.",
    state: "active_mid",
    fields: { weight: true, mood: true, sleep: true, prs: true },
  },
  {
    name: "Sarah Maatouk",
    email: "sarah.m+seed@example.com",
    phone: "+961 71 200 022",
    goals: "Look strong in a swimsuit by August. Build visible shoulders + glutes.",
    injuries: null,
    notes: "Loves the gym, hates cardio. Open to mobility once a week.",
    noteToTrainer: null,
    state: "active_mid",
    fields: { weight: true, measurements: true, progress_photos: true },
  },
  {
    name: "Mariam Khalil",
    email: "mariam.k+seed@example.com",
    phone: "+961 76 300 033",
    goals: "Postnatal return to training. Rebuild core, no breath holding.",
    injuries: "Diastasis cleared by physio in March. Watch intra-abdominal pressure.",
    notes: "Sessions kept to 45 min while baby naps.",
    noteToTrainer: "Cleared for normal load this week, finally!",
    state: "active_mid",
    fields: { weight: true, mood: true, cycle: true },
  },
  {
    name: "Tara Bouez",
    email: "tara.b+seed@example.com",
    phone: "+961 70 400 044",
    goals: "Run a half marathon in October. Don&apos;t lose strength while building mileage.",
    injuries: null,
    notes: "Runs 3x/week independently; uses studio for strength + mobility.",
    noteToTrainer: null,
    state: "active_renewing",
    fields: { weight: true, sleep: true, prs: true },
  },
  {
    name: "Noor Rahbani",
    email: "noor.r+seed@example.com",
    phone: "+961 78 500 055",
    goals: "Get out of low-back pain. Build a routine she can do without supervision.",
    injuries: "Chronic lumbar tightness. McGill big-3 in every session.",
    notes: null,
    noteToTrainer: null,
    state: "active_renewing",
    fields: { weight: true, mood: true },
  },
  {
    name: "Lea Daher",
    email: "lea.d+seed@example.com",
    phone: "+961 76 600 066",
    goals: "First serious training block. Confident with the basics.",
    injuries: null,
    notes: "Just signed up. Awaiting first payment.",
    noteToTrainer: null,
    state: "pending_payment",
    fields: { weight: true },
  },
  {
    name: "Omar Saade",
    email: "omar.s+seed@example.com",
    phone: "+961 71 700 077",
    goals: "Bench press 100kg. Don&apos;t care about the scale.",
    injuries: null,
    notes: null,
    noteToTrainer: null,
    state: "pending_payment",
    fields: { weight: true, prs: true },
  },
  {
    name: "Yasmine Fares",
    email: "yasmine.f+seed@example.com",
    phone: "+961 70 800 088",
    goals: "Was consistent for a year, then took six months off. Coming back gradually.",
    injuries: null,
    notes: "Last block expired in March. Considering whether to renew.",
    noteToTrainer: null,
    state: "expired",
    fields: { weight: true, mood: true },
  },
];

const PENDING_INVITE = {
  displayName: "Dana Tabbara",
  email: "dana.t+seed@example.com",
  phone: "+961 71 900 099",
  notes: "Friend of Tara. Wants to start once travel ends late May.",
};

// 4 new templates to round out to 6 total. We&apos;ll look up exercise
// IDs from Joelle&apos;s library by name and link them.
type TemplateSpec = {
  name: string;
  dayLabel: string | null;
  description: string | null;
  blocks: Array<{
    label: string | null;
    rounds: number;
    exercises: Array<{
      exerciseName: string;
      sets: Array<{
        sets: number;
        repType: "fixed" | "range" | "time" | "amrap" | "unilateral" | "hold";
        repValue: Record<string, unknown>;
        weightType: "load" | "bw" | "intensity" | "blank" | "percentage";
        weightValue: Record<string, unknown>;
        restSeconds: number;
        label?: string;
      }>;
    }>;
  }>;
};

const NEW_TEMPLATES: TemplateSpec[] = [
  {
    name: "Upper · Push focused",
    dayLabel: "upper push",
    description: "Heavy bench → assistance push → triceps + shoulders finisher.",
    blocks: [
      {
        label: null,
        rounds: 1,
        exercises: [
          {
            exerciseName: "Bench press",
            sets: [
              {
                sets: 1,
                repType: "fixed",
                repValue: { type: "fixed", reps: 8 },
                weightType: "intensity",
                weightValue: { type: "intensity", descriptor: "warm-up" },
                restSeconds: 90,
                label: "warm-up",
              },
              {
                sets: 4,
                repType: "fixed",
                repValue: { type: "fixed", reps: 5 },
                weightType: "load",
                weightValue: { type: "load", kg: 60 },
                restSeconds: 150,
                label: "working",
              },
            ],
          },
          {
            exerciseName: "Incline bench press",
            sets: [
              {
                sets: 3,
                repType: "fixed",
                repValue: { type: "fixed", reps: 8 },
                weightType: "load",
                weightValue: { type: "load", kg: 40 },
                restSeconds: 120,
              },
            ],
          },
          {
            exerciseName: "Push-up",
            sets: [
              {
                sets: 3,
                repType: "amrap",
                repValue: { type: "amrap" },
                weightType: "bw",
                weightValue: { type: "bw" },
                restSeconds: 90,
              },
            ],
          },
        ],
      },
      {
        label: "triceps + shoulders",
        rounds: 3,
        exercises: [
          {
            exerciseName: "Tricep pushdown",
            sets: [
              {
                sets: 1,
                repType: "fixed",
                repValue: { type: "fixed", reps: 12 },
                weightType: "load",
                weightValue: { type: "load", kg: 25 },
                restSeconds: 0,
              },
            ],
          },
          {
            exerciseName: "Lateral raise",
            sets: [
              {
                sets: 1,
                repType: "fixed",
                repValue: { type: "fixed", reps: 12 },
                weightType: "load",
                weightValue: { type: "load", kg: 7 },
                restSeconds: 60,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Lower · Squat day",
    dayLabel: "lower squat",
    description: "Back squat focus, with single-leg accessory work.",
    blocks: [
      {
        label: null,
        rounds: 1,
        exercises: [
          {
            exerciseName: "Back squat",
            sets: [
              {
                sets: 5,
                repType: "fixed",
                repValue: { type: "fixed", reps: 5 },
                weightType: "load",
                weightValue: { type: "load", kg: 70 },
                restSeconds: 180,
              },
            ],
          },
          {
            exerciseName: "Bulgarian split squat",
            sets: [
              {
                sets: 3,
                repType: "unilateral",
                repValue: { type: "unilateral", per_side: 8 },
                weightType: "load",
                weightValue: { type: "load", kg: 14 },
                restSeconds: 90,
              },
            ],
          },
          {
            exerciseName: "Leg curl",
            sets: [
              {
                sets: 3,
                repType: "fixed",
                repValue: { type: "fixed", reps: 12 },
                weightType: "load",
                weightValue: { type: "load", kg: 30 },
                restSeconds: 60,
              },
            ],
          },
          {
            exerciseName: "Standing calf raise",
            sets: [
              {
                sets: 3,
                repType: "fixed",
                repValue: { type: "fixed", reps: 15 },
                weightType: "load",
                weightValue: { type: "load", kg: 40 },
                restSeconds: 60,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Full body · Conditioning",
    dayLabel: "metcon",
    description: "Two grouped circuits: barbell complex + bodyweight finisher.",
    blocks: [
      {
        label: "barbell complex",
        rounds: 4,
        exercises: [
          {
            exerciseName: "Romanian deadlift",
            sets: [
              {
                sets: 1,
                repType: "fixed",
                repValue: { type: "fixed", reps: 6 },
                weightType: "load",
                weightValue: { type: "load", kg: 50 },
                restSeconds: 0,
              },
            ],
          },
          {
            exerciseName: "Bent-over row",
            sets: [
              {
                sets: 1,
                repType: "fixed",
                repValue: { type: "fixed", reps: 6 },
                weightType: "load",
                weightValue: { type: "load", kg: 50 },
                restSeconds: 0,
              },
            ],
          },
          {
            exerciseName: "Overhead press",
            sets: [
              {
                sets: 1,
                repType: "fixed",
                repValue: { type: "fixed", reps: 6 },
                weightType: "load",
                weightValue: { type: "load", kg: 30 },
                restSeconds: 90,
              },
            ],
          },
        ],
      },
      {
        label: "finisher",
        rounds: 3,
        exercises: [
          {
            exerciseName: "Burpee",
            sets: [
              {
                sets: 1,
                repType: "fixed",
                repValue: { type: "fixed", reps: 10 },
                weightType: "bw",
                weightValue: { type: "bw" },
                restSeconds: 0,
              },
            ],
          },
          {
            exerciseName: "Air squat",
            sets: [
              {
                sets: 1,
                repType: "fixed",
                repValue: { type: "fixed", reps: 20 },
                weightType: "bw",
                weightValue: { type: "bw" },
                restSeconds: 60,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Mobility flow",
    dayLabel: "mobility",
    description: "Timer-based flow, EMOM-style. Use as warm-up or recovery day.",
    blocks: [
      {
        label: "EMOM 12 min",
        rounds: 4,
        exercises: [
          {
            exerciseName: "World's greatest stretch",
            sets: [
              {
                sets: 1,
                repType: "time",
                repValue: { type: "time", seconds: 45 },
                weightType: "bw",
                weightValue: { type: "bw" },
                restSeconds: 0,
              },
            ],
          },
          {
            exerciseName: "90/90 hip stretch",
            sets: [
              {
                sets: 1,
                repType: "time",
                repValue: { type: "time", seconds: 45 },
                weightType: "bw",
                weightValue: { type: "bw" },
                restSeconds: 0,
              },
            ],
          },
          {
            exerciseName: "Cat-cow",
            sets: [
              {
                sets: 1,
                repType: "time",
                repValue: { type: "time", seconds: 45 },
                weightType: "bw",
                weightValue: { type: "bw" },
                restSeconds: 0,
              },
            ],
          },
        ],
      },
    ],
  },
];

// ─── Idempotent insertion helpers ────────────────────────────────────────

async function getJoelleTenant(): Promise<string> {
  const rows = await runSql<{ id: string }>(
    `select id from public.trainers where subdomain_slug = ${esc(TENANT_SLUG)};`,
  );
  if (!rows[0]) throw new Error("Joelle tenant not found");
  return rows[0].id;
}

async function ensureClient(tenantId: string, c: ClientSpec): Promise<string> {
  const existing = await runSql<{ id: string }>(
    `select id from public.clients where tenant_id = ${esc(tenantId)} and lower(display_name) = lower(${esc(c.name)});`,
  );
  if (existing[0]) return existing[0].id;
  const inserted = await runSql<{ id: string }>(
    `insert into public.clients (tenant_id, display_name, email, phone, goals, injuries, notes, note_to_trainer, active)
     values (${esc(tenantId)}, ${esc(c.name)}, ${esc(c.email)}, ${esc(c.phone)}, ${esc(c.goals)}, ${esc(c.injuries)}, ${esc(c.notes)}, ${esc(c.noteToTrainer)}, true)
     returning id;`,
  );
  if (!inserted[0]) throw new Error(`Failed to insert client ${c.name}`);
  return inserted[0].id;
}

async function ensureProfileFields(tenantId: string, clientId: string, fields: ClientSpec["fields"]): Promise<void> {
  const existing = await runSql<{ client_id: string }>(
    `select client_id from public.client_profile_fields where tenant_id = ${esc(tenantId)} and client_id = ${esc(clientId)};`,
  );
  if (existing[0]) return;
  await runSql(
    `insert into public.client_profile_fields (tenant_id, client_id, weight, cycle, measurements, mood, sleep, prs, progress_photos)
     values (${esc(tenantId)}, ${esc(clientId)}, ${fields.weight ?? false}, ${fields.cycle ?? false}, ${fields.measurements ?? false}, ${fields.mood ?? false}, ${fields.sleep ?? false}, ${fields.prs ?? false}, ${fields.progress_photos ?? false});`,
  );
}

async function ensureSubscription(
  tenantId: string,
  clientId: string,
  packageId: string,
  state: ClientSpec["state"],
  sessionCount: number,
): Promise<{ id: string | null; sessionsRemaining: number }> {
  // One sub per (client, status-class). For active_mid / active_renewing,
  // ensure exactly one paid sub. For pending_payment, one pending sub.
  // For expired, no current sub but historical row.

  const existingActive = await runSql<{ id: string; payment_status: string }>(
    `select id, payment_status from public.subscriptions where tenant_id = ${esc(tenantId)} and client_id = ${esc(clientId)} order by created_at desc limit 1;`,
  );
  if (existingActive[0]) {
    return { id: existingActive[0].id, sessionsRemaining: 0 };
  }

  const today = new Date();
  let startDate = new Date(today);
  let endDate = new Date(today);
  let sessionsRemaining = sessionCount;
  let paymentStatus = "paid";
  let paidAt: string | null = today.toISOString();
  let nextRenewal: string | null = null;
  let autoRenew = true;

  switch (state) {
    case "active_mid": {
      startDate.setDate(today.getDate() - 25);
      endDate.setDate(today.getDate() + 35);
      sessionsRemaining = Math.floor(sessionCount / 2);
      nextRenewal = dateOnly(endDate);
      break;
    }
    case "active_renewing": {
      startDate.setDate(today.getDate() - 55);
      endDate.setDate(today.getDate() + 4);
      sessionsRemaining = 2;
      nextRenewal = dateOnly(endDate);
      break;
    }
    case "pending_payment": {
      startDate = today;
      endDate.setDate(today.getDate() + 30);
      sessionsRemaining = 0;
      paymentStatus = "pending";
      paidAt = null;
      nextRenewal = dateOnly(endDate);
      autoRenew = false;
      break;
    }
    case "expired": {
      startDate.setDate(today.getDate() - 90);
      endDate.setDate(today.getDate() - 25);
      sessionsRemaining = 0;
      nextRenewal = null;
      autoRenew = false;
      break;
    }
    default:
      return { id: null, sessionsRemaining: 0 };
  }

  const inserted = await runSql<{ id: string }>(
    `insert into public.subscriptions (tenant_id, client_id, package_id, start_date, end_date, sessions_remaining, payment_status, payment_method, paid_confirmed_at, next_renewal_date, auto_renew)
     values (${esc(tenantId)}, ${esc(clientId)}, ${esc(packageId)}, ${esc(dateOnly(startDate))}, ${esc(dateOnly(endDate))}, ${sessionsRemaining}, ${esc(paymentStatus)}, 'manual', ${paidAt ? esc(paidAt) : "null"}, ${nextRenewal ? esc(nextRenewal) : "null"}, ${autoRenew})
     returning id;`,
  );
  if (!inserted[0]) throw new Error(`Failed to insert subscription for client ${clientId}`);
  return { id: inserted[0].id, sessionsRemaining };
}

async function ensurePendingInvite(tenantId: string, packageId: string): Promise<void> {
  const code = "DANATB"; // 6-char beta-style code
  const existing = await runSql<{ code: string }>(
    `select code from public.client_invites where tenant_id = ${esc(tenantId)} and code = ${esc(code)};`,
  );
  if (existing[0]) return;
  await runSql(
    `insert into public.client_invites (code, tenant_id, display_name, email, phone, notes, package_id)
     values (${esc(code)}, ${esc(tenantId)}, ${esc(PENDING_INVITE.displayName)}, ${esc(PENDING_INVITE.email)}, ${esc(PENDING_INVITE.phone)}, ${esc(PENDING_INVITE.notes)}, ${esc(packageId)});`,
  );
}

async function findExerciseIds(tenantId: string, names: string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  const list = names.map((n) => esc(n)).join(", ");
  const rows = await runSql<{ id: string; name: string }>(
    `select id, name from public.exercises where tenant_id = ${esc(tenantId)} and lower(name) in (${names.map((n) => esc(n.toLowerCase())).join(", ")}) and not archived;`,
  );
  const out = new Map<string, string>();
  for (const r of rows) out.set(r.name.toLowerCase(), r.id);
  // Also try by case-insensitive: handled by lower(...) above.
  // (`list` kept to avoid shadowing-a-noop lint flag.)
  void list;
  return out;
}

async function ensureTemplate(tenantId: string, t: TemplateSpec): Promise<string> {
  const existing = await runSql<{ id: string }>(
    `select id from public.session_templates where tenant_id = ${esc(tenantId)} and lower(name) = lower(${esc(t.name)});`,
  );
  if (existing[0]) return existing[0].id;

  // Resolve all exercise names referenced in the template.
  const allNames = t.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseName));
  const ids = await findExerciseIds(tenantId, allNames);

  const tpl = await runSql<{ id: string }>(
    `insert into public.session_templates (tenant_id, name, day_label, description)
     values (${esc(tenantId)}, ${esc(t.name)}, ${esc(t.dayLabel)}, ${esc(t.description)})
     returning id;`,
  );
  if (!tpl[0]) throw new Error(`Failed to insert template ${t.name}`);
  const templateId = tpl[0].id;

  for (let bi = 0; bi < t.blocks.length; bi++) {
    const block = t.blocks[bi]!;
    const blk = await runSql<{ id: string }>(
      `insert into public.template_blocks (template_id, tenant_id, order_index, round_label, round_count, round_rest_seconds)
       values (${esc(templateId)}, ${esc(tenantId)}, ${bi}, ${esc(block.label)}, ${block.rounds}, 60)
       returning id;`,
    );
    if (!blk[0]) throw new Error(`block insert failed for ${t.name}`);
    const blockId = blk[0].id;

    for (let ei = 0; ei < block.exercises.length; ei++) {
      const ex = block.exercises[ei]!;
      const exerciseId = ids.get(ex.exerciseName.toLowerCase());
      if (!exerciseId) {
        console.warn(`   skip exercise (not in library): ${ex.exerciseName}`);
        continue;
      }
      const be = await runSql<{ id: string }>(
        `insert into public.template_block_exercises (block_id, exercise_id, tenant_id, order_index)
         values (${esc(blockId)}, ${esc(exerciseId)}, ${esc(tenantId)}, ${ei})
         returning id;`,
      );
      if (!be[0]) throw new Error(`block_exercise insert failed`);
      const beId = be[0].id;

      for (let si = 0; si < ex.sets.length; si++) {
        const sg = ex.sets[si]!;
        await runSql(
          `insert into public.template_set_groups (block_exercise_id, tenant_id, order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds)
           values (${esc(beId)}, ${esc(tenantId)}, ${si}, ${esc(sg.label ?? null)}, ${sg.sets}, ${esc(sg.repType)}, ${jsonb(sg.repValue)}, ${esc(sg.weightType)}, ${jsonb(sg.weightValue)}, ${sg.restSeconds});`,
        );
      }
    }
  }
  return templateId;
}

async function cloneTemplateIntoSession(
  tenantId: string,
  templateId: string,
  sessionId: string,
  withPerformed: boolean,
): Promise<void> {
  const blocks = await runSql<{
    id: string;
    order_index: number;
    round_label: string | null;
    round_count: number;
    round_rest_seconds: number | null;
  }>(
    `select id, order_index, round_label, round_count, round_rest_seconds from public.template_blocks where template_id = ${esc(templateId)} order by order_index;`,
  );
  for (const b of blocks) {
    const newBlock = await runSql<{ id: string }>(
      `insert into public.session_blocks (session_id, tenant_id, order_index, round_label, round_count, round_rest_seconds)
       values (${esc(sessionId)}, ${esc(tenantId)}, ${b.order_index}, ${esc(b.round_label)}, ${b.round_count}, ${b.round_rest_seconds ?? "null"})
       returning id;`,
    );
    if (!newBlock[0]) continue;
    const blockId = newBlock[0].id;

    const bes = await runSql<{ id: string; exercise_id: string; order_index: number; setup_override: string | null }>(
      `select id, exercise_id, order_index, setup_override from public.template_block_exercises where block_id = ${esc(b.id)} order by order_index;`,
    );
    for (const be of bes) {
      const newBe = await runSql<{ id: string }>(
        `insert into public.session_block_exercises (block_id, exercise_id, tenant_id, order_index, setup_override)
         values (${esc(blockId)}, ${esc(be.exercise_id)}, ${esc(tenantId)}, ${be.order_index}, ${esc(be.setup_override)})
         returning id;`,
      );
      if (!newBe[0]) continue;
      const beId = newBe[0].id;

      const sgs = await runSql<{
        order_index: number;
        label: string | null;
        sets: number;
        rep_type: string;
        rep_value: unknown;
        weight_type: string;
        weight_value: unknown;
        rest_seconds: number | null;
      }>(
        `select order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds from public.template_set_groups where block_exercise_id = ${esc(be.id)} order by order_index;`,
      );
      for (const sg of sgs) {
        const performedSets = withPerformed ? sg.sets : null;
        const performedReps = withPerformed ? jsonb([{ reps: 5 }, { reps: 5 }, { reps: 5 }]) : "null";
        const performedWeight = withPerformed ? jsonb([{ kg: 50 }, { kg: 52.5 }, { kg: 55 }]) : "null";
        const performedNotes = withPerformed
          ? esc(pick(["felt strong", "missed last rep", "form crisp", "next time go heavier", null], Math.floor(Math.random() * 5)))
          : "null";

        await runSql(
          `insert into public.session_set_groups (block_exercise_id, tenant_id, order_index, label, sets, rep_type, rep_value, weight_type, weight_value, rest_seconds, performed_sets, performed_reps, performed_weight, performed_notes)
           values (${esc(beId)}, ${esc(tenantId)}, ${sg.order_index}, ${esc(sg.label)}, ${sg.sets}, ${esc(sg.rep_type)}, ${jsonb(sg.rep_value)}, ${esc(sg.weight_type)}, ${jsonb(sg.weight_value)}, ${sg.rest_seconds ?? "null"}, ${performedSets ?? "null"}, ${performedReps}, ${performedWeight}, ${performedNotes});`,
        );
      }
    }
  }
}

async function seedSessions(
  tenantId: string,
  clientsBySpec: { spec: ClientSpec; id: string; subscriptionId: string | null }[],
  templateIds: string[],
): Promise<void> {
  // Skip if Joelle already has > 25 sessions — the seed has run.
  const count = await runSql<{ count: string }>(
    `select count(*)::text as count from public.sessions where tenant_id = ${esc(tenantId)};`,
  );
  if (Number(count[0]?.count ?? "0") >= 30) {
    console.log("   sessions already seeded, skipping");
    return;
  }

  const now = new Date();
  const activeClients = clientsBySpec.filter(
    (c) => c.spec.state === "active_mid" || c.spec.state === "active_renewing",
  );
  if (activeClients.length === 0) return;

  // 30 completed sessions over the past 60 days, distributed across active clients.
  for (let i = 0; i < 30; i++) {
    const client = pick(activeClients, i);
    const daysAgo = Math.floor((i / 30) * 60) + Math.floor(Math.random() * 3);
    const scheduled = new Date(now);
    scheduled.setDate(now.getDate() - daysAgo);
    scheduled.setHours(8 + (i % 6), [0, 15, 30, 45][i % 4]!, 0, 0);

    const templateId = pick(templateIds, i);
    const sessionType = pick(["in_person", "in_person", "in_person", "zoom", "in_app"], i);
    // Completed in-app sessions in the seed are trainer-pushed (the
    // trainer scheduled and prescribed them as part of the package).
    // Client-requested ($3) in-app sessions are seeded separately below.
    const inAppOriginSql = sessionType === "in_app" ? "'trainer_pushed'" : "null";

    const session = await runSql<{ id: string }>(
      `insert into public.sessions (tenant_id, client_id, subscription_id, source_template_id, scheduled_at, duration_minutes, session_type, in_app_origin, status, name, completed_at)
       values (${esc(tenantId)}, ${esc(client.id)}, ${client.subscriptionId ? esc(client.subscriptionId) : "null"}, ${esc(templateId)}, ${esc(scheduled.toISOString())}, 60, ${esc(sessionType)}, ${inAppOriginSql}, 'completed', ${esc(`Session ${i + 1}`)}, ${esc(scheduled.toISOString())})
       returning id;`,
    );
    if (session[0]) await cloneTemplateIntoSession(tenantId, templateId, session[0].id, true);
  }

  // 8 future scheduled sessions over the next 14 days.
  for (let i = 0; i < 8; i++) {
    const client = pick(activeClients, i + 1);
    const daysAhead = Math.floor((i / 8) * 14) + 1;
    const scheduled = new Date(now);
    scheduled.setDate(now.getDate() + daysAhead);
    scheduled.setHours(9 + (i % 6), 0, 0, 0);
    const templateId = pick(templateIds, i + 2);
    const sessionType = pick(["in_person", "zoom", "in_person"], i);
    const session = await runSql<{ id: string }>(
      `insert into public.sessions (tenant_id, client_id, subscription_id, source_template_id, scheduled_at, duration_minutes, session_type, status, name)
       values (${esc(tenantId)}, ${esc(client.id)}, ${client.subscriptionId ? esc(client.subscriptionId) : "null"}, ${esc(templateId)}, ${esc(scheduled.toISOString())}, 60, ${esc(sessionType)}, 'scheduled', ${esc(`Session ${i + 31}`)})
       returning id;`,
    );
    if (session[0]) await cloneTemplateIntoSession(tenantId, templateId, session[0].id, false);
  }

  // 3 client-requested extra in-app workouts awaiting trainer approval.
  // These are the $3 add-ons — origin='client_requested', no deduction
  // from the package, paired with a pending payment row.
  for (let i = 0; i < 3; i++) {
    const client = pick(activeClients, i);
    const scheduled = new Date(now);
    scheduled.setDate(now.getDate() + 2 + i);
    scheduled.setHours(17 + i, 0, 0, 0);
    const sess = await runSql<{ id: string }>(
      `insert into public.sessions (tenant_id, client_id, scheduled_at, duration_minutes, session_type, in_app_origin, in_app_surcharge_paid, status, notes)
       values (${esc(tenantId)}, ${esc(client.id)}, ${esc(scheduled.toISOString())}, 60, 'in_app', 'client_requested', false, 'requested', ${esc("Hoping to fit in an extra workout this week.")})
       returning id;`,
    );
    const sessionId = sess[0]?.id;
    if (sessionId) {
      await runSql(
        `insert into public.payments (tenant_id, subscription_id, session_id, amount_usd, method, status)
         values (${esc(tenantId)}, null, ${esc(sessionId)}, 3, 'manual', 'pending');`,
      );
    }
  }

  // 2 cancelled sessions.
  for (let i = 0; i < 2; i++) {
    const client = pick(activeClients, i);
    const scheduled = new Date(now);
    scheduled.setDate(now.getDate() - (5 + i * 2));
    scheduled.setHours(10, 0, 0, 0);
    await runSql(
      `insert into public.sessions (tenant_id, client_id, scheduled_at, duration_minutes, session_type, status, name)
       values (${esc(tenantId)}, ${esc(client.id)}, ${esc(scheduled.toISOString())}, 60, ${esc(i === 0 ? "in_person" : "zoom")}, 'cancelled', ${esc(`Cancelled session`)});`,
    );
  }

  // 1 in-app session prescribed by the trainer (deducts from package,
  // not surcharged) — represents a "trainer-pushed in-app workout".
  if (activeClients[0]) {
    const client = activeClients[0];
    const scheduled = new Date(now);
    scheduled.setDate(now.getDate() + 1);
    scheduled.setHours(18, 0, 0, 0);
    const templateId = templateIds[0]!;
    const sess = await runSql<{ id: string }>(
      `insert into public.sessions (tenant_id, client_id, subscription_id, source_template_id, scheduled_at, duration_minutes, session_type, in_app_origin, status, name, in_app_surcharge_paid)
       values (${esc(tenantId)}, ${esc(client.id)}, ${client.subscriptionId ? esc(client.subscriptionId) : "null"}, ${esc(templateId)}, ${esc(scheduled.toISOString())}, 60, 'in_app', 'trainer_pushed', 'scheduled', ${esc("In-app prescribed workout")}, false)
       returning id;`,
    );
    if (sess[0]) await cloneTemplateIntoSession(tenantId, templateId, sess[0].id, false);
  }

  // 1 client-requested extra in-app workout that has already been
  // approved + the $3 paid — this exercises the "completed paid extra"
  // path on the trainer ledger and the +$3 badge on the client.
  if (activeClients[1]) {
    const client = activeClients[1];
    const scheduled = new Date(now);
    scheduled.setDate(now.getDate() + 4);
    scheduled.setHours(8, 30, 0, 0);
    const templateId = templateIds[1] ?? templateIds[0]!;
    const sess = await runSql<{ id: string }>(
      `insert into public.sessions (tenant_id, client_id, source_template_id, scheduled_at, duration_minutes, session_type, in_app_origin, in_app_surcharge_paid, status, name)
       values (${esc(tenantId)}, ${esc(client.id)}, ${esc(templateId)}, ${esc(scheduled.toISOString())}, 60, 'in_app', 'client_requested', true, 'scheduled', ${esc("Extra workout (client-requested)")})
       returning id;`,
    );
    const sessionId = sess[0]?.id;
    if (sessionId) {
      await cloneTemplateIntoSession(tenantId, templateId, sessionId, false);
      await runSql(
        `insert into public.payments (tenant_id, subscription_id, session_id, amount_usd, method, status)
         values (${esc(tenantId)}, null, ${esc(sessionId)}, 3, 'manual', 'paid');`,
      );
    }
  }
}

/**
 * Calendar showcase block.
 *
 * The base `seedSessions` spreads 8 future scheduled sessions across
 * 14 days at one-per-day cadence — accurate, but a thin schedule
 * that makes the calendar page (especially the new iOS-style day
 * timeline) look quiet. This adds a denser, varied set of 15
 * sessions anchored to TODAY in the trainer's local timezone, so
 * opening `/studio/calendar` lands on a populated week with
 * multiple sessions per day across realistic training hours.
 *
 * Idempotent via a `name LIKE 'showcase:%'` marker: re-running the
 * seed sees the marker rows and skips. To re-generate (e.g. after a
 * long gap so "today" has drifted), delete the existing showcase
 * rows first:
 *
 *   delete from public.sessions
 *    where tenant_id = '<joelle-id>' and name like 'showcase:%';
 */
async function seedCalendarShowcase(
  tenantId: string,
  clientsBySpec: { spec: ClientSpec; id: string; subscriptionId: string | null }[],
  templateIds: string[],
): Promise<void> {
  const existing = await runSql<{ count: string }>(
    `select count(*)::text as count from public.sessions
       where tenant_id = ${esc(tenantId)} and name like 'showcase:%';`,
  );
  if (Number(existing[0]?.count ?? "0") > 0) {
    console.log("   calendar showcase already seeded, skipping");
    return;
  }

  const active = clientsBySpec.filter(
    (c) => c.spec.state === "active_mid" || c.spec.state === "active_renewing",
  );
  if (active.length === 0) return;

  // Day-offset, HH:mm, session type, label. Distributed to fill
  // today + the next 5 days with realistic training-hour density:
  // an early morning, a mid-day, an evening block on busy days.
  const slots: Array<{
    dayOffset: number;
    time: string;
    sessionType: "in_person" | "zoom";
    label: string;
  }> = [
    { dayOffset: 0, time: "07:00", sessionType: "in_person", label: "today early" },
    { dayOffset: 0, time: "09:30", sessionType: "zoom", label: "today morning" },
    { dayOffset: 0, time: "12:00", sessionType: "zoom", label: "today lunch" },
    { dayOffset: 0, time: "17:30", sessionType: "in_person", label: "today evening" },
    { dayOffset: 1, time: "08:00", sessionType: "zoom", label: "tomorrow am" },
    { dayOffset: 1, time: "11:00", sessionType: "in_person", label: "tomorrow mid" },
    { dayOffset: 1, time: "19:00", sessionType: "zoom", label: "tomorrow pm" },
    { dayOffset: 2, time: "09:00", sessionType: "zoom", label: "d2 am" },
    { dayOffset: 2, time: "16:00", sessionType: "in_person", label: "d2 pm" },
    { dayOffset: 3, time: "18:00", sessionType: "zoom", label: "d3 evening" },
    { dayOffset: 4, time: "07:00", sessionType: "in_person", label: "d4 early" },
    { dayOffset: 4, time: "14:00", sessionType: "zoom", label: "d4 afternoon" },
    { dayOffset: 4, time: "18:30", sessionType: "zoom", label: "d4 evening" },
    { dayOffset: 5, time: "10:00", sessionType: "in_person", label: "d5 am" },
    { dayOffset: 5, time: "15:00", sessionType: "zoom", label: "d5 pm" },
  ];

  // Trainer's local "today" — same shape as in the studio layout's
  // dashboard math. We assume UTC for the script (it's a one-off
  // tooling run); the trainer's actual timezone math at render time
  // re-anchors everything in their local view anyway.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const client = active[i % active.length]!;
    const templateId = templateIds[i % Math.max(templateIds.length, 1)] ?? null;

    const when = new Date(today);
    when.setDate(today.getDate() + slot.dayOffset);
    const [hStr = "0", mStr = "0"] = slot.time.split(":");
    when.setHours(Number(hStr), Number(mStr), 0, 0);

    await runSql(
      `insert into public.sessions
         (tenant_id, client_id, subscription_id, source_template_id, scheduled_at, duration_minutes, session_type, status, name)
       values (
         ${esc(tenantId)},
         ${esc(client.id)},
         ${client.subscriptionId ? esc(client.subscriptionId) : "null"},
         ${templateId ? esc(templateId) : "null"},
         ${esc(when.toISOString())},
         60,
         ${esc(slot.sessionType)},
         'scheduled',
         ${esc(`showcase: ${slot.label}`)}
       );`,
    );
  }
}

async function seedLogs(tenantId: string, clientsBySpec: { spec: ClientSpec; id: string }[]): Promise<void> {
  // Pick clients with relevant fields enabled and seed time-series data.
  const now = new Date();

  for (const c of clientsBySpec) {
    const existing = await runSql<{ count: string }>(
      `select count(*)::text as count from public.client_logs where client_id = ${esc(c.id)};`,
    );
    if (Number(existing[0]?.count ?? "0") > 0) continue;

    if (c.spec.fields.weight) {
      const baseKg = 60 + Math.floor(Math.random() * 20);
      for (let d = 30; d >= 0; d -= Math.random() < 0.4 ? 1 : 2) {
        const day = new Date(now);
        day.setDate(now.getDate() - d);
        const kg = baseKg + (Math.random() - 0.5) * 1.2;
        await runSql(
          `insert into public.client_logs (tenant_id, client_id, field_type, value, logged_at)
           values (${esc(tenantId)}, ${esc(c.id)}, 'weight', ${jsonb({ kg: Number(kg.toFixed(1)) })}, ${esc(day.toISOString())});`,
        );
      }
    }
    if (c.spec.fields.cycle) {
      const phases = ["menstrual", "follicular", "ovulation", "luteal"] as const;
      for (let d = 30; d >= 0; d -= 7) {
        const day = new Date(now);
        day.setDate(now.getDate() - d);
        await runSql(
          `insert into public.client_logs (tenant_id, client_id, field_type, value, logged_at)
           values (${esc(tenantId)}, ${esc(c.id)}, 'cycle', ${jsonb({ phase: phases[Math.floor(d / 7) % 4] })}, ${esc(day.toISOString())});`,
        );
      }
    }
    if (c.spec.fields.measurements) {
      for (const dAgo of [28, 14, 0]) {
        const day = new Date(now);
        day.setDate(now.getDate() - dAgo);
        await runSql(
          `insert into public.client_logs (tenant_id, client_id, field_type, value, logged_at)
           values (${esc(tenantId)}, ${esc(c.id)}, 'measurements', ${jsonb({
             chest_cm: 92 + (Math.random() - 0.5) * 2,
             waist_cm: 74 + (Math.random() - 0.5) * 2,
             hips_cm: 96 + (Math.random() - 0.5) * 2,
             arms_cm: 30 + (Math.random() - 0.5) * 1,
           })}, ${esc(day.toISOString())});`,
        );
      }
    }
    if (c.spec.fields.mood) {
      for (let d = 21; d >= 0; d -= 2) {
        const day = new Date(now);
        day.setDate(now.getDate() - d);
        await runSql(
          `insert into public.client_logs (tenant_id, client_id, field_type, value, logged_at)
           values (${esc(tenantId)}, ${esc(c.id)}, 'mood', ${jsonb({ score: 3 + Math.floor(Math.random() * 3) })}, ${esc(day.toISOString())});`,
        );
      }
    }
    if (c.spec.fields.sleep) {
      for (let d = 21; d >= 0; d -= 2) {
        const day = new Date(now);
        day.setDate(now.getDate() - d);
        await runSql(
          `insert into public.client_logs (tenant_id, client_id, field_type, value, logged_at)
           values (${esc(tenantId)}, ${esc(c.id)}, 'sleep', ${jsonb({ score: 3 + Math.floor(Math.random() * 3) })}, ${esc(day.toISOString())});`,
        );
      }
    }
    if (c.spec.fields.prs) {
      for (const lift of ["Back squat", "Bench press", "Conventional deadlift"]) {
        const day = new Date(now);
        day.setDate(now.getDate() - Math.floor(Math.random() * 30));
        await runSql(
          `insert into public.client_logs (tenant_id, client_id, field_type, value, logged_at)
           values (${esc(tenantId)}, ${esc(c.id)}, 'pr', ${jsonb({ exercise: lift, kg: 60 + Math.floor(Math.random() * 60) })}, ${esc(day.toISOString())});`,
        );
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("→ resolving Joelle tenant…");
  const tenantId = await getJoelleTenant();
  console.log(`   ${tenantId}`);

  console.log("\n→ pickin&apos; an active package…");
  const pkgs = await runSql<{ id: string; session_count: number; name: string }>(
    `select id, session_count, name from public.packages where tenant_id = ${esc(tenantId)} and active order by created_at limit 1;`,
  );
  const defaultPackage = pkgs[0];
  if (!defaultPackage) throw new Error("No active package on Joelle's tenant — seed packages first.");
  console.log(`   using "${defaultPackage.name}" (${defaultPackage.session_count} sessions)`);

  console.log("\n→ ensuring 8 mockup clients (idempotent)…");
  const created: { spec: ClientSpec; id: string; subscriptionId: string | null }[] = [];
  for (const c of NEW_CLIENTS) {
    const id = await ensureClient(tenantId, c);
    await ensureProfileFields(tenantId, id, c.fields);
    const sub = await ensureSubscription(tenantId, id, defaultPackage.id, c.state, defaultPackage.session_count);
    created.push({ spec: c, id, subscriptionId: sub.id });
    console.log(`   ✓ ${c.name} (${c.state})`);
  }

  console.log("\n→ ensuring pending invite for Dana Tabbara…");
  await ensurePendingInvite(tenantId, defaultPackage.id);
  console.log(`   ✓ invite code DANATB`);

  console.log("\n→ ensuring 4 new session templates…");
  const templateIds: string[] = [];
  for (const t of NEW_TEMPLATES) {
    const id = await ensureTemplate(tenantId, t);
    templateIds.push(id);
    console.log(`   ✓ ${t.name}`);
  }
  // Pull in any pre-existing templates so seedSessions has more variety.
  const preExisting = await runSql<{ id: string }>(
    `select id from public.session_templates where tenant_id = ${esc(tenantId)} and not archived and id not in (${templateIds.length > 0 ? templateIds.map((i) => esc(i)).join(", ") : esc("00000000-0000-0000-0000-000000000000")});`,
  );
  for (const p of preExisting) templateIds.push(p.id);

  console.log("\n→ seeding sessions (30 past + 8 future + 3 requested + 2 cancelled + 1 in-app)…");
  await seedSessions(tenantId, created, templateIds);

  console.log("\n→ seeding calendar showcase (15 sessions across today + next 5 days)…");
  await seedCalendarShowcase(tenantId, created, templateIds);

  console.log("\n→ seeding client logs (weight/cycle/measurements/mood/sleep/prs)…");
  await seedLogs(tenantId, created);

  console.log("\n✓ seed complete\n");

  // Summary
  const summary = await runSql<{ kind: string; count: string }>(
    `select 'clients' as kind, count(*)::text from public.clients where tenant_id = ${esc(tenantId)}
     union all select 'packages', count(*)::text from public.packages where tenant_id = ${esc(tenantId)}
     union all select 'exercises', count(*)::text from public.exercises where tenant_id = ${esc(tenantId)} and not archived
     union all select 'templates', count(*)::text from public.session_templates where tenant_id = ${esc(tenantId)} and not archived
     union all select 'sessions', count(*)::text from public.sessions where tenant_id = ${esc(tenantId)}
     union all select 'client_logs', count(*)::text from public.client_logs where tenant_id = ${esc(tenantId)}
     union all select 'subscriptions', count(*)::text from public.subscriptions where tenant_id = ${esc(tenantId)};`,
  );
  console.log("Final tally:");
  for (const row of summary) console.log(`   ${row.kind}: ${row.count}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
