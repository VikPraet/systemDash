import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function readJsonVersion(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { version?: string };
    return raw.version ?? null;
  } catch {
    return null;
  }
}

/** Installed app version from VERSION.json or package.json (not npm_package_version). */
export function readAppVersion(): string {
  const cwdVersion = readJsonVersion(path.join(process.cwd(), "VERSION.json"));
  if (cwdVersion) return cwdVersion;

  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const releaseVersion = readJsonVersion(path.join(appRoot, "VERSION.json"));
  if (releaseVersion) return releaseVersion;

  const rootVersion = readJsonVersion(path.join(appRoot, "package.json"));
  if (rootVersion) return rootVersion;

  const serverVersion = readJsonVersion(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../package.json")
  );
  if (serverVersion) return serverVersion;

  return process.env.npm_package_version ?? "0.0.0";
}
