import { chromium } from "playwright";

const BASE = "https://form-studio-pied.vercel.app";
const BETA_CODE = "joelle-owner";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (m) => {
  if (m.type() === "error") console.log(`[ERR] ${m.text()}`);
});
page.on("pageerror", (e) => console.log(`[EXC] ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 400 || r.status() === 307) {
    // Only show meaningful failures
    if (r.status() >= 400 && !r.url().includes("clerk.accounts.dev")) {
      console.log(`[${r.status()}] ${r.url()}`);
    }
  }
});

console.log("\n=== 1. Beta gate + homepage ===");
await page.goto(BASE);
console.log("  beta page loaded:", (await page.title()));
await page.fill('input[name="code"]', BETA_CODE);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/beta")),
  page.click('button[type="submit"]'),
]);
console.log("  entered code, now at:", page.url());
const homeText = await page.evaluate(() => document.body.innerText.slice(0, 120));
console.log("  homepage text:", homeText.replace(/\n/g, " | "));

console.log("\n=== 2. Click 'start your studio' (client-side nav) ===");
await Promise.all([
  page.waitForURL(/\/sign-up/),
  page.click('a[href="/sign-up"]'),
]);
await page.waitForTimeout(5000);
const signupText = await page.evaluate(() => document.body.innerText);
console.log("  sign-up renders Clerk widget:",
  signupText.includes("Create your account") || signupText.includes("Continue"));
if (signupText.includes("Something broke")) {
  console.log("  ❌ ERROR PAGE SHOWN:");
  console.log(signupText.slice(0, 500));
}

console.log("\n=== 3. Sign-in page ===");
await page.goto(BASE + "/sign-in");
await page.waitForTimeout(4000);
const signinText = await page.evaluate(() => document.body.innerText);
console.log("  sign-in renders Clerk widget:",
  signinText.includes("Sign in") || signinText.includes("Continue"));

console.log("\n=== 4. /beta exempt paths ===");
const sw = await page.goto(BASE + "/sw.js");
console.log("  /sw.js status:", sw?.status());

await browser.close();
console.log("\n✓ tests done");
