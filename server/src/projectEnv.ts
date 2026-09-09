const UNIX_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "TERM",
  "TMPDIR",
  "TZ",
  "DISPLAY",
] as const;

const WIN_KEYS = [
  "PATH",
  "Path",
  "PATHEXT",
  "SYSTEMROOT",
  "SystemRoot",
  "WINDIR",
  "windir",
  "COMSPEC",
  "ComSpec",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "TEMP",
  "TMP",
  "USERNAME",
  "LANG",
  "TERM",
] as const;

function copyKey(out: NodeJS.ProcessEnv, key: string): void {
  const v = process.env[key];
  if (v !== undefined) out[key] = v;
}

/** Host env safe to inherit into project/worker/compose processes. */
export function baseProjectEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  if (process.platform === "win32") {
    for (const key of WIN_KEYS) copyKey(out, key);
  } else {
    for (const key of UNIX_KEYS) copyKey(out, key);
  }
  for (const key of Object.keys(process.env)) {
    if (key === "LC_ALL" || key.startsWith("LC_")) copyKey(out, key);
  }
  return out;
}

export function mergeProjectEnv(
  extra?: Record<string, string | undefined>
): NodeJS.ProcessEnv {
  const out = baseProjectEnv();
  if (!extra) return out;
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
