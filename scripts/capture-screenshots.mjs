/**
 * Capture README screenshots from a running dev server.
 * Usage: node scripts/capture-screenshots.mjs
 * Requires: npx playwright (chromium)
 *
 * Pages (classic dark): docs/screenshots/pages/{page}.png
 * Themes (overview):    docs/screenshots/themes/{id}-{dark|light}.png
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../docs/screenshots");
const PAGE_OUT = path.join(OUT, "pages");
const THEME_OUT = path.join(OUT, "themes");
const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:5273";
const USER = process.env.SCREENSHOT_USER ?? "admin";
const PASS = process.env.SCREENSHOT_PASS ?? "12345678";

const THEMES = ["classic", "lime", "phosphor", "ember", "midnight"];
const APPEARANCES = ["dark", "light"];

const PAGES = [
  { name: "overview", path: "/overview", wait: 8000 },
  { name: "history", path: "/history", wait: 10000 },
  { name: "processes", path: "/processes", wait: 6000 },
  { name: "containers", path: "/containers", wait: 8000 },
  { name: "projects", path: "/projects", wait: 8000 },
  { name: "files", path: "/files", wait: 7000 },
  { name: "terminal", path: "/terminal", wait: 10000 },
  { name: "users", path: "/users", wait: 4000 },
  { name: "updates", path: "/updates", wait: 8000 },
  { name: "activity", path: "/activity", wait: 6000 },
];

async function setTheme(page, themeId, appearance) {
  if (!page.url().startsWith(BASE)) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
  await page.evaluate(
    ({ themeId, appearance }) => {
      localStorage.setItem("systemdash.themeId", themeId);
      localStorage.setItem("systemdash.appearance", appearance);
      const until = String(Date.now() + 365 * 24 * 60 * 60 * 1000);
      for (let i = 0; i < 32; i++) {
        localStorage.setItem(`recoveryNudgeSnooze:${i}`, until);
      }
    },
    { themeId, appearance }
  );
}

async function persistThemeOnServer(page, themeId, appearance) {
  return page.evaluate(
    async ({ themeId, appearance }) => {
      const res = await fetch("/api/settings");
      if (!res.ok) return false;
      const settings = await res.json();
      const dashboard = settings.dashboard ?? {
        themeId: "classic",
        appearance: "dark",
        layouts: {},
      };
      const put = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          dashboard: { ...dashboard, themeId, appearance },
        }),
      });
      return put.ok;
    },
    { themeId, appearance }
  );
}

async function applyTheme(page, themeId, appearance, persist = false) {
  await setTheme(page, themeId, appearance);
  if (persist) {
    const ok = await persistThemeOnServer(page, themeId, appearance);
    if (!ok) console.warn("  (could not persist theme to /api/settings)");
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    ({ id, mode }) =>
      document.documentElement.dataset.themeId === id &&
      document.documentElement.dataset.theme === mode,
    { id: themeId, mode: appearance },
    { timeout: 15000 }
  );
}

async function gotoAndWait(page, route, waitMs) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(waitMs);
}

async function shot(page, file) {
  await page.screenshot({ path: file, fullPage: false, caret: "hide" });
  console.log(`  → ${file}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);
  if (!page.url().includes("/login")) return;

  await page.locator('input[autocomplete="username"]').fill(USER);
  await page.locator('input[autocomplete="current-password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(PAGE_OUT, { recursive: true });
  fs.mkdirSync(THEME_OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log("Login page…");
  await applyTheme(page, "classic", "dark");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  if (page.url().includes("/login")) {
    await shot(page, path.join(PAGE_OUT, "login.png"));
  } else {
    console.log("  (already signed in — skipping login shot)");
  }

  console.log("Logging in…");
  await login(page);
  await applyTheme(page, "classic", "dark", true);
  await page.waitForTimeout(800);

  for (const { name, path: route, wait } of PAGES) {
    console.log(`Capturing ${name} (${route})…`);
    await gotoAndWait(page, route, wait);
    await shot(page, path.join(PAGE_OUT, `${name}.png`));
  }

  for (const themeId of THEMES) {
    for (const appearance of APPEARANCES) {
      console.log(`Capturing overview · ${themeId} ${appearance}…`);
      await applyTheme(page, themeId, appearance, true);
      await gotoAndWait(page, "/overview", 7000);
      await shot(page, path.join(THEME_OUT, `${themeId}-${appearance}.png`));
    }
  }

  await applyTheme(page, "classic", "dark", true);

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
