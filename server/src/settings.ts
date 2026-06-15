import { promises as fsp } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface FileManagerSettings {
  /** Show dotfiles / hidden entries in listings. */
  showHiddenFiles: boolean;
  /** Show file extensions in displayed names. */
  showFileExtensions: boolean;
  /** Compute and display folder sizes (can be slow on large trees). */
  showFolderSizes: boolean;
  /** Ask for confirmation before deleting. */
  confirmDelete: boolean;
}

export interface Settings {
  files: FileManagerSettings;
}

const DEFAULTS: Settings = {
  files: {
    showHiddenFiles: false,
    showFileExtensions: true,
    showFolderSizes: true,
    confirmDelete: true,
  },
};

// Persist under the user's home dir so it's writable regardless of where the
// server was launched from. Override with SYSTEMDASH_DATA_DIR if desired.
const DATA_DIR =
  process.env.SYSTEMDASH_DATA_DIR ?? path.join(os.homedir(), ".systemdash");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

let cached: Settings | null = null;

/** Coerces unknown input into a valid Settings object, falling back to defaults. */
function sanitize(input: unknown): Settings {
  const files = (input as Settings)?.files ?? {};
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  return {
    files: {
      showHiddenFiles: bool(files.showHiddenFiles, DEFAULTS.files.showHiddenFiles),
      showFileExtensions: bool(
        files.showFileExtensions,
        DEFAULTS.files.showFileExtensions
      ),
      showFolderSizes: bool(files.showFolderSizes, DEFAULTS.files.showFolderSizes),
      confirmDelete: bool(files.confirmDelete, DEFAULTS.files.confirmDelete),
    },
  };
}

export async function getSettings(): Promise<Settings> {
  if (cached) return cached;
  try {
    const raw = await fsp.readFile(SETTINGS_FILE, "utf8");
    cached = sanitize(JSON.parse(raw));
  } catch {
    // Missing/corrupt file => start from defaults.
    cached = DEFAULTS;
  }
  return cached;
}

export async function saveSettings(input: unknown): Promise<Settings> {
  const next = sanitize(input);
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  cached = next;
  return next;
}
