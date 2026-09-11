/**
 * Keep Beacon running when something unexpected throws.
 * Expected failures (missing project folder, bad share, etc.) already return
 * HTTP errors. These handlers catch the rest so one bug cannot take down the
 * dashboard process.
 */
export type UnexpectedKind = "uncaughtException" | "unhandledRejection";

export type UnexpectedLogger = (kind: UnexpectedKind, err: unknown) => void;

const defaultLog: UnexpectedLogger = (kind, err) => {
  console.error(`[beacon] ${kind}:`, err);
};

let installed = false;
let logger: UnexpectedLogger = defaultLog;

export function handleUnexpected(kind: UnexpectedKind, err: unknown): void {
  logger(kind, err);
}

function onUnhandledRejection(reason: unknown): void {
  handleUnexpected("unhandledRejection", reason);
}

function onUncaughtException(err: unknown): void {
  handleUnexpected("uncaughtException", err);
}

export function installProcessGuards(log: UnexpectedLogger = defaultLog): void {
  if (installed) return;
  logger = log;
  process.on("unhandledRejection", onUnhandledRejection);
  process.on("uncaughtException", onUncaughtException);
  installed = true;
}

export function uninstallProcessGuards(): void {
  if (!installed) return;
  process.removeListener("unhandledRejection", onUnhandledRejection);
  process.removeListener("uncaughtException", onUncaughtException);
  installed = false;
  logger = defaultLog;
}

export function isProcessGuardsInstalled(): boolean {
  return installed;
}
