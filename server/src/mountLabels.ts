import path from "node:path";

/** Pseudo / kernel mounts that clutter drive lists and aren't useful to browse. */
export const SKIP_FS_TYPES = new Set([
  "efivarfs",
  "fusectl",
  "configfs",
  "debugfs",
  "tracefs",
  "securityfs",
  "pstore",
  "bpf",
  "cgroup",
  "cgroup2",
  "proc",
  "sysfs",
  "nsfs",
  "rpc_pipefs",
  "binfmt_misc",
  "autofs",
  "mqueue",
  "hugetlbfs",
  "devpts",
  "devtmpfs",
]);

export const DOCKER_OVERLAY_RE =
  /^\/var\/lib\/docker\/overlay2\/([^/]+)\/merged\/?$/i;

export function shouldSkipLinuxMount(
  mount: string,
  fsType: string | undefined
): boolean {
  const type = (fsType || "").toLowerCase();
  if (SKIP_FS_TYPES.has(type)) return true;
  // Snap loop mounts and kernel trees aren't useful as "drives".
  if (mount.startsWith("/snap/") && (type === "squashfs" || type === "overlay")) {
    return true;
  }
  if (mount.startsWith("/sys/") || mount.startsWith("/proc/")) return true;
  return false;
}

/** Human-readable title + muted subtitle for a Linux mount. */
export function linuxMountLabel(
  mount: string,
  fs: string | null,
  dockerNames: Map<string, string>
): { name: string; label: string | null } {
  const normalized = path.normalize(mount);
  const container =
    dockerNames.get(normalized) ||
    dockerNames.get(mount) ||
    dockerNames.get(mount.replace(/\/$/, ""));
  if (container) {
    return { name: container, label: "Docker container" };
  }

  const overlay = DOCKER_OVERLAY_RE.exec(mount);
  if (overlay) {
    const id = overlay[1];
    const short = id.length > 12 ? `${id.slice(0, 12)}…` : id;
    return { name: `Docker · ${short}`, label: "Docker layer" };
  }

  if (mount === "/") {
    return { name: "/", label: fs };
  }

  // Prefer a short leaf for deep paths; keep the device/fs as the subtitle.
  if (mount.length > 36) {
    const leaf = mount.split("/").filter(Boolean).pop() || mount;
    return { name: leaf, label: fs ? `${fs} · ${mount}` : mount };
  }

  return { name: mount, label: fs };
}

/** Title + subtitle for a volume, including optional user nicknames. */
export function describeVolume(
  mount: string,
  fs: string | null,
  type: string | undefined,
  aliases: Record<string, string>,
  dockerNames: Map<string, string>
): { name: string; label: string | null } {
  if (process.platform === "win32") {
    const letter = /^([A-Za-z]):/.exec(mount)?.[1]?.toUpperCase();
    if (letter) {
      const systemName = `${letter}:`;
      const drive = `${letter}:\\`;
      const alias = aliases[drive]?.trim() || aliases[systemName]?.trim();
      if (alias) return { name: alias, label: systemName };
      return { name: systemName, label: type || null };
    }
    return { name: mount || fs || "Disk", label: type || null };
  }

  const { name, label } = linuxMountLabel(mount, fs, dockerNames);
  const alias = aliases[mount]?.trim();
  if (alias) {
    return { name: alias, label: label ? `${name} · ${label}` : name };
  }
  return { name, label };
}
