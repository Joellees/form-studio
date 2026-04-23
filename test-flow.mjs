import { chromium } from "playwright";

const BASE = "https://form-studio-pied.vercel.app";
const BETA_CODE = "joelle-owner";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error") errors.push(`[console.error] ${t}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on("requestfailed", (r) => errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`[${r.status()}] ${r.request().method()} ${r.url()}`);
});

console.log("→ beta gate");
await page.goto(BASE, { waitUntil: "networkidle" });
console.log(`  at: ${page.url()}`);

console.log("→ enter code");
await page.fill('input[name="code"]', BETA_CODE);
await Promise.all([
  page.waitForURL((url) => !url.pathname.startsWith("/beta"), { timeout: 15000 }),
  page.click('button[type="submit"]'),
]);
console.log(`  at: ${page.url()}`);

console.log("→ find start-your-studio link");
const links = await page.$$eval("a", (as) => as.map((a) => ({ text: a.textContent?.trim() ?? "", href: a.getAttribute("href") })));
console.log("  links on page:");
links.forEach((l) => console.log(`    "${l.text}" -> ${l.href}`));

console.log("→ click /sign-up link");
try {
  await Promise.all([
    page.waitForURL(/\/sign-up/, { timeout: 15000 }),
    page.click('a[href="/sign-up"]'),
  ]);
  console.log(`  navigated to: ${page.url()}`);
} catch (e) {
  console.log(`  navigation failed: ${e.message}`);
  console.log(`  current url: ${page.url()}`);
}

await page.waitForLoadState("networkidle").catch(() => {});

console.log("→ page state after navigation");
console.log(`  title: ${await page.title()}`);
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log(`  body (first 500 chars):`);
console.log(bodyText.split("\n").map((l) => `    ${l}`).join("\n"));

await browser.close();

console.log("\n=== errors / 4xx-5xx ===");
errors.slice(0, 40).forEach((e) => console.log(e));
console.log(`\n${errors.length} total`);
