import { chromium } from "playwright";
const BASE = "https://form-studio-pied.vercel.app";
const CLERK = "sk_test_rgBIPxILTcOb2gDpDpWh79iofqm9HRvvlrLqnUfTCI";

async function ticket(uid) {
  const r = await (await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${CLERK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: uid, expires_in_seconds: 3600 }),
  })).json();
  return r.url.split("__clerk_ticket=")[1];
}
async function enter(page, beta, uid) {
  await page.goto(BASE + "/beta");
  await page.fill('input[name="code"]', beta);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/beta")), page.click('button[type="submit"]')]);
  await page.goto(`${BASE}/sign-in?__clerk_ticket=${await ticket(uid)}`);
  await page.waitForTimeout(4000);
}

// Ensure we have at least one exercise in library
const SUPA = "https://rcjuqgvvpnjzifrvvsbq.supabase.co/rest/v1";
const SVC = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjanVxZ3Z2cG5qemlmcnZ2c2JxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjkyMzY5MywiZXhwIjoyMDkyNDk5NjkzfQ.q_aeSuAywlqSDXwgHEvA77-jkCvRcA07u96OWrUV7rw";
const TENANT = "76558e6a-a077-4fb2-8bb0-67e5ae28a916";

const existing = await (await fetch(`${SUPA}/exercises?tenant_id=eq.${TENANT}&archived=eq.false&select=id`, {
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}` }
})).json();
if (existing.length === 0) {
  await fetch(`${SUPA}/exercises`, {
    method: "POST", headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      { tenant_id: TENANT, name: "Romanian Deadlift", group_tag: "hinge", equipment: "barbell", default_rest_seconds: 90 },
      { tenant_id: TENANT, name: "Back Squat", group_tag: "squat", equipment: "barbell", default_rest_seconds: 120 },
      { tenant_id: TENANT, name: "Pull-up", group_tag: "pull", equipment: "bw", is_unilateral: false, default_rest_seconds: 90 },
    ]),
  });
  console.log("seeded 3 exercises");
}

const b = await chromium.launch({ headless: true });
const tp = await b.newPage();
await enter(tp, "joelle-owner", "user_3Cl58t35DRcojqySnL8TqobTHrV");

// Find an upcoming session and go to it
const sessions = await (await fetch(`${SUPA}/sessions?tenant_id=eq.${TENANT}&status=eq.scheduled&select=id&limit=1`, {
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}` }
})).json();
const sid = sessions[0].id;
console.log("session id:", sid);

await tp.goto(`${BASE}/studio/sessions/${sid}`);
await tp.waitForTimeout(3000);
const txt1 = await tp.evaluate(() => document.body.innerText);
console.log("\n--- session page (trainer) ---");
console.log(txt1.split("\n").filter(Boolean).slice(0, 20).join(" | ").slice(0, 500));
console.log("\nerror page?", txt1.includes("Something broke"));

// Add an exercise from library
console.log("\nadding exercise from library…");
const addBtn = tp.locator('button:has-text("add")').first();
await addBtn.click();
await tp.waitForTimeout(3000);
const txt2 = await tp.evaluate(() => document.body.innerText);
console.log("after add:", txt2.split("\n").filter((s) => /exercise 0/i.test(s) || /Romanian|Back Squat|Pull-up/i.test(s)).join(" | ").slice(0, 300));

// Save a note
await tp.fill('textarea#session-notes', "Focus on bracing before the pull. Keep pace steady.");
await tp.keyboard.press("Tab"); // trigger blur → save
await tp.waitForTimeout(2000);
console.log("\nnotes saved");

await b.close();
