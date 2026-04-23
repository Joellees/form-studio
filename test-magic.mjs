import { chromium } from "playwright";

const BASE = "https://form-studio-pied.vercel.app";
const BETA_CODE = "joelle-owner";

// Generate fresh magic link
const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk_test_rgBIPxILTcOb2gDpDpWh79iofqm9HRvvlrLqnUfTCI",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ user_id: "user_3Cl58t35DRcojqySnL8TqobTHrV", expires_in_seconds: 3600 }),
});
const tokenData = await res.json();
const ticket = tokenData.url.split("__clerk_ticket=")[1];
console.log("Ticket obtained:", ticket.slice(0, 40) + "...");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log(`[EXC] ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") console.log(`[ERR] ${m.text()}`);
});

// Unlock beta
await page.goto(BASE);
await page.fill('input[name="code"]', BETA_CODE);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/beta")),
  page.click('button[type="submit"]'),
]);
console.log("✓ beta unlocked");

// Hit our sign-in page with the ticket query param
const signinUrl = `${BASE}/sign-in?__clerk_ticket=${ticket}`;
console.log(`→ navigating to sign-in with ticket`);
await page.goto(signinUrl);

// Wait for redirect
await page.waitForTimeout(8000);

const finalUrl = page.url();
const bodyText = await page.evaluate(() => document.body.innerText);
console.log(`\nfinal url: ${finalUrl}`);
console.log(`\nbody text:`);
console.log(bodyText.slice(0, 500));

await page.screenshot({ path: "/tmp/magic-result.png", fullPage: true });
await browser.close();
