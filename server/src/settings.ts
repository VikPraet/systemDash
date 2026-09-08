import { promises as fsp } from "node:fs";
import path from "node:path";
import {
  configureHistory,
  HISTORY_DEFAULTS,
  type HistorySettings,
} from "./history.js";
import {
  ACTIVITY_DEFAULTS,
  configureActivity,
  pruneAudit,
  type ActivitySettings,
} from "./auth.js";
import { DATA_DIR } from "./paths.js";

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
export type { ActivitySettings } from "./auth.js";

const USERNAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Empty string means "do not switch". Invalid names fall back to `fallback`. */
export function sanitizeOsUsername(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed.length > 32 || !USERNAME_RE.test(trimmed)) return fallback;
  return trimmed;
}

export interface TerminalSettings {
  /**
   * Optional Linux OS account for the in-app terminal (and Files → Home).
   * Empty means "use the account that runs Beacon". When set and the
   * process is root, the terminal opens with `su -` into this user.
   * Per-machine — never ships with a username filled in.
   */
  osUser: string;
}

export interface Settings {
  files: FileManagerSettings;
  history: HistorySettings;
  activity: ActivitySettings;
  terminal: TerminalSettings;
}

const DEFAULTS: Settings = {
  files: {
    showHiddenFiles: false,
    showFileExtensions: true,
    showFolderSizes: true,
    confirmDelete: true,
  },
  history: HISTORY_DEFAULTS,
  activity: ACTIVITY_DEFAULTS,
  terminal: {
    osUser: "",
  },
};

// Reasonable guard rails for the customisable history limits.
const HISTORY_BOUNDS = {
  intervalSeconds: { min: 1, max: 3600 },
  retentionDays: { min: 0, max: 3650 },
  maxSizeMb: { min: 0, max: 1_048_576 },
};

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

let cached: Settings | null = null;

/** Coerces unknown input into a valid Settings object, falling back to defaults. */
function sanitize(input: unknown): Settings {
  const files = (input as Settings)?.files ?? ({} as FileManagerSettings);
  const history = (input as Settings)?.history ?? ({} as HistorySettings);
  const activity = (input as Settings)?.activity ?? ({} as ActivitySettings);
  const terminal = (input as Settings)?.terminal ?? ({} as TerminalSettings);
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
    activity: {
      enabled: bool(activity.enabled, DEFAULTS.activity.enabled),
      retentionDays: intIn(
        activity.retentionDays,
        DEFAULTS.activity.retentionDays,
        HISTORY_BOUNDS.retentionDays
      ),
      maxSizeMb: intIn(
        activity.maxSizeMb,
        DEFAULTS.activity.maxSizeMb,
        HISTORY_BOUNDS.maxSizeMb
      ),
    },
    terminal: {
      osUser: sanitizeOsUsername(terminal.osUser, DEFAULTS.terminal.osUser),
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
  configureActivity(next.activity);
  pruneAudit();
  return next;
}

/** Loads settings and starts the history recorder. Call once at startup. */
export async function initSettings(): Promise<Settings> {
  const settings = await getSettings();
  configureHistory(settings.history);
  configureActivity(settings.activity);
  pruneAudit();
  return settings;
}

// Human-friendly names for sections and fields, used when describing what a user
// changed in the audit log. Adding a new settings section later (e.g.
// "dashboard") just means adding its labels here — the diff itself is generic.
const SECTION_LABELS: Record<string, string> = {
  files: "Files",
  history: "History",
  activity: "Activity",
  terminal: "Terminal",
};

const FIELD_LABELS: Record<string, Record<string, string>> = {
  files: {
    showHiddenFiles: "Show hidden files",
    showFileExtensions: "Show file extensions",
    showFolderSizes: "Show folder sizes",
    confirmDelete: "Confirm before delete",
  },
  history: {
    enabled: "Recording enabled",
    intervalSeconds: "Sample interval (s)",
    retentionDays: "Retention (days)",
    maxSizeMb: "Max size (MB)",
  },
  activity: {
    enabled: "Recording enabled",
    retentionDays: "Retention (days)",
    maxSizeMb: "Max size (MB)",
  },
  terminal: {
    osUser: "Default OS user",
  },
};

function formatSettingValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "on" : "off";
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" || typeof v === "string") return String(v);
  return JSON.stringify(v);
}

export interface SettingsDiff {
  /** A human-readable summary like "Files — Show hidden files: off → on". */
  detail: string;
  /** Section keys that had at least one changed field. */
  sections: string[];
  /** Total number of changed leaf fields. */
  count: number;
}

/**
 * Diffs two settings objects into a per-section, per-field summary suitable for
 * an audit-log detail string. Iterates generically over whatever sections exist
 * so new settings groups are picked up automatically.
 */
export function diffSettings(prev: Settings, next: Settings): SettingsDiff {
  const parts: string[] = [];
  const sections: string[] = [];
  let count = 0;

  for (const section of Object.keys(next) as (keyof Settings)[]) {
    const before = (prev?.[section] ?? {}) as unknown as Record<string, unknown>;
    const after = next[section] as unknown as Record<string, unknown>;
    if (!after || typeof after !== "object") continue;

    const changes: string[] = [];
    for (const key of Object.keys(after)) {
      if (before[key] !== after[key]) {
        const label = FIELD_LABELS[section]?.[key] ?? key;
        changes.push(
          `${label}: ${formatSettingValue(before[key])} → ${formatSettingValue(
            after[key]
          )}`
        );
        count++;
      }
    }

    if (changes.length > 0) {
      sections.push(section);
      const sectionLabel = SECTION_LABELS[section] ?? section;
      parts.push(`${sectionLabel} — ${changes.join(", ")}`);
    }
  }

  return { detail: parts.join("; "), sections, count };
}
