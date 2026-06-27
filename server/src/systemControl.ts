import { spawn } from "node:child_process";

export type PowerAction = "reboot" | "shutdown" | "poweroff";

export class PowerError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface PowerCapabilities {
  available: boolean;
  platform: string;
  actions: PowerAction[];
  needsElevation: boolean;
  defaultDelaySeconds: number;
  hint: string | null;
}

const DEFAULT_DELAY = 5;
const MIN_DELAY = 3;
const MAX_DELAY = 300;

const CONFIRM: Record<PowerAction, string> = {
  reboot: "REBOOT",
  shutdown: "SHUTDOWN",
  poweroff: "POWEROFF",
};

function needsElevation(): boolean {
  return (
    process.platform !== "win32" &&
    typeof process.getuid === "function" &&
    process.getuid() !== 0
  );
}

function isDisabled(): boolean {
  return process.env.SYSTEMDASH_DISABLE_POWER_OPS === "1";
}

export function getPowerCapabilities(): PowerCapabilities {
  const platform = process.platform;
  const elevate = needsElevation();

  if (isDisabled()) {
    return {
      available: false,
      platform,
      actions: [],
      needsElevation: elevate,
      defaultDelaySeconds: DEFAULT_DELAY,
      hint: "Power operations are disabled (SYSTEMDASH_DISABLE_POWER_OPS=1).",
    };
  }

  if (platform === "win32" || platform === "linux" || platform === "darwin") {
    return {
      available: true,
      platform,
      actions: ["reboot", "shutdown", "poweroff"],
      needsElevation: elevate,
      defaultDelaySeconds: DEFAULT_DELAY,
      hint: elevate
        ? "Requires passwordless sudo for shutdown/reboot — configure sudoers like package updates."
        : null,
    };
  }

  return {
    available: false,
    platform,
    actions: [],
    needsElevation: elevate,
    defaultDelaySeconds: DEFAULT_DELAY,
    hint: "Host power control is not supported on this platform.",
  };
}

export function expectedConfirm(action: PowerAction): string {
  return CONFIRM[action];
}

export function validatePowerRequest(
  action: unknown,
  confirm: unknown,
  delaySeconds: unknown
): { action: PowerAction; delaySeconds: number } {
  if (action !== "reboot" && action !== "shutdown" && action !== "poweroff") {
    throw new PowerError(400, 'action must be "reboot", "shutdown", or "poweroff"');
  }

  const caps = getPowerCapabilities();
  if (!caps.available) {
    throw new PowerError(403, caps.hint ?? "power operations are not available");
  }

  if (confirm !== CONFIRM[action]) {
    throw new PowerError(
      400,
      `confirmation must be exactly "${CONFIRM[action]}" (uppercase)`
    );
  }

  let delay = DEFAULT_DELAY;
  if (delaySeconds !== undefined && delaySeconds !== null) {
    const n = Number(delaySeconds);
    if (!Number.isFinite(n) || n < MIN_DELAY || n > MAX_DELAY) {
      throw new PowerError(
        400,
        `delaySeconds must be between ${MIN_DELAY} and ${MAX_DELAY}`
      );
    }
    delay = Math.round(n);
  }

  return { action, delaySeconds: delay };
}

/** Schedule a host power action. Returns immediately; the OS command runs after a short defer. */
export function schedulePowerAction(action: PowerAction, delaySeconds: number): void {
  const delayMs = 800;
  setTimeout(() => {
    try {
      runDetached(buildCommand(action, delaySeconds));
    } catch (err) {
      console.error("power action failed:", err);
    }
  }, delayMs);
}

function runDetached(spec: { cmd: string; args: string[] }): void {
  const child = spawn(spec.cmd, spec.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function buildCommand(action: PowerAction, delaySeconds: number): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    const flag = action === "reboot" ? "/r" : "/s";
    const args = [flag, "/t", String(delaySeconds)];
    if (action === "poweroff") args.push("/f");
    return { cmd: "shutdown", args };
  }

  const inner = unixInnerCommand(action);
  const elevate = needsElevation();
  const shellBody = elevate
    ? `sleep ${delaySeconds} && sudo -n ${inner}`
    : `sleep ${delaySeconds} && ${inner}`;
  return { cmd: "sh", args: ["-c", shellBody] };
}

function unixInnerCommand(action: PowerAction): string {
  if (process.platform === "darwin") {
    switch (action) {
      case "reboot":
        return "shutdown -r now";
      case "shutdown":
        return "shutdown -h now";
      case "poweroff":
        return "shutdown -h -u now";
    }
  }

  switch (action) {
    case "reboot":
      return "systemctl reboot";
    case "shutdown":
      return "systemctl poweroff";
    case "poweroff":
      return "systemctl poweroff --force";
  }
}

export function actionLabel(action: PowerAction): string {
  switch (action) {
    case "reboot":
      return "reboot";
    case "shutdown":
      return "shutdown";
    case "poweroff":
      return "force power off";
  }
}
