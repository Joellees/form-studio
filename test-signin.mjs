import { chromium } from "playwright";

const BASE = "https://form-studio-pied.vercel.app";
const BETA_CODE = "joelle-owner";
const EMAIL = "estephanjoelle@gmail.com";
const PASSWORD = "FormStudio-Beta-2026!";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (m) => {
  if (m.type() === "error") console.log(`[ERR] ${m.text()}`);
});
page.on("pageerror", (e) => console.log(`[EXC] ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 500) console.log(`[${r.status()}] ${r.url()}`);
});

await page.goto(BASE);
await page.fill('input[name="code"]', BETA_CODE);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/beta")),
  page.click('button[type="submit"]'),
]);
console.log("✓ beta unlocked");

await page.goto(BASE + "/sign-in");
await page.waitForSelector('input[name="identifier"]', { timeout: 15000 });
await page.fill('input[name="identifier"]', EMAIL);

// The Clerk primary form button has the class "cl-formButtonPrimary"
await page.click(".cl-formButtonPrimary");
console.log("✓ email submitted");

await page.waitForSelector('input[name="password"]:not([disabled])', { timeout: 15000 });
await page.fill('input[name="password"]', PASSWORD);

console.log("→ submitting password...");
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 45000 }).catch(() => {}),
  page.click(".cl-formButtonPrimary"),
]);

await page.waitForTimeout(5000);
const finalUrl = page.url();
const bodyText = await page.evaluate(() => document.body.innerText);
console.log(`\nfinal url: ${finalUrl}`);
console.log(`\nbody text (first 500):`);
console.log(bodyText.slice(0, 500));

if (bodyText.includes("Something broke") || bodyText.includes("Nothing lives here")) {
  console.log("\n❌ ERROR PAGE");
  const digest = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll("p")).find((el) => el.textContent?.startsWith("ref:"));
    return p?.textContent ?? "none";
  });
  console.log("  ref: " + digest);
} else {
  console.log("\n✓ no error page");
}

await page.screenshot({ path: "/tmp/after-signin.png", fullPage: true });
await browser.close();
