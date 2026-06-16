/**
 * Capture README screenshots from a running dev server.
 * Usage: node scripts/capture-screenshots.mjs
 * Requires: npx playwright (chromium)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../docs/screenshots");
const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:5173";
const USER = process.env.SCREENSHOT_USER ?? "test_admin";
const PASS = process.env.SCREENSHOT_PASS ?? "12345678";

const PAGES = [
  { name: "overview", path: "/overview", wait: 8000 },
  { name: "history", path: "/history", wait: 10000 },
  { name: "processes", path: "/processes", wait: 6000 },
  { name: "containers", path: "/containers", wait: 8000 },
  { name: "files", path: "/files", wait: 6000 },
  { name: "terminal", path: "/terminal", wait: 10000 },
  { name: "activity", path: "/activity", wait: 6000 },
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;

  await page.fill('input[type="text"], input[name="username"], input[autocomplete="username"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log("Logging in…");
  await login(page);

  for (const { name, path: route, wait } of PAGES) {
    console.log(`Capturing ${name} (${route}) — waiting ${wait / 1000}s…`);
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(wait);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  → ${file}`);
  }

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
