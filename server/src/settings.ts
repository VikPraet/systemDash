import { promises as fsp } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  configureHistory,
  HISTORY_DEFAULTS,
  type HistorySettings,
} from "./history.js";

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

export type { HistorySettings } from "./history.js";

export interface Settings {
  files: FileManagerSettings;
  history: HistorySettings;
}

const DEFAULTS: Settings = {
  files: {
    showHiddenFiles: false,
    showFileExtensions: true,
    showFolderSizes: true,
    confirmDelete: true,
  },
  history: HISTORY_DEFAULTS,
};

// Reasonable guard rails for the customisable history limits.
const HISTORY_BOUNDS = {
  intervalSeconds: { min: 1, max: 3600 },
  retentionDays: { min: 0, max: 3650 },
  maxSizeMb: { min: 0, max: 1_048_576 },
};

// Persist under the user's home dir so it's writable regardless of where the
// server was launched from. Override with SYSTEMDASH_DATA_DIR if desired.
const DATA_DIR =
  process.env.SYSTEMDASH_DATA_DIR ?? path.join(os.homedir(), ".systemdash");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

let cached: Settings | null = null;

/** Coerces unknown input into a valid Settings object, falling back to defaults. */
function sanitize(input: unknown): Settings {
  const files = (input as Settings)?.files ?? ({} as FileManagerSettings);
  const history = (input as Settings)?.history ?? ({} as HistorySettings);
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  const intIn = (
    v: unknown,
    fallback: number,
    bounds: { min: number; max: number }
  ) => {
    const n = typeof v === "number" ? Math.round(v) : Number.NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.max(bounds.min, Math.min(bounds.max, n));
  };
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
    history: {
      enabled: bool(history.enabled, DEFAULTS.history.enabled),
      intervalSeconds: intIn(
        history.intervalSeconds,
        DEFAULTS.history.intervalSeconds,
        HISTORY_BOUNDS.intervalSeconds
      ),
      retentionDays: intIn(
        history.retentionDays,
        DEFAULTS.history.retentionDays,
        HISTORY_BOUNDS.retentionDays
      ),
      maxSizeMb: intIn(
        history.maxSizeMb,
        DEFAULTS.history.maxSizeMb,
        HISTORY_BOUNDS.maxSizeMb
      ),
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
  configureHistory(next.history);
  return next;
}

/** Loads settings and starts the history recorder. Call once at startup. */
export async function initSettings(): Promise<Settings> {
  const settings = await getSettings();
  configureHistory(settings.history);
  return settings;
}
