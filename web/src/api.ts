import type {
  DirListing,
  FsEntry,
  FsRoot,
  ProcessList,
  Settings,
  SystemSnapshot,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  files: {
    showHiddenFiles: false,
    showFileExtensions: true,
    showFolderSizes: true,
    confirmDelete: true,
  },
};

export async function fetchSettings(signal?: AbortSignal): Promise<Settings> {
  const res = await fetch("/api/settings", { signal });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as Settings;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  return postJson("/api/settings", settings);
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<SystemSnapshot> {
  const res = await fetch("/api/system", { signal });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as SystemSnapshot;
}

export async function fetchProcesses(signal?: AbortSignal): Promise<ProcessList> {
  const res = await fetch("/api/processes", { signal });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as ProcessList;
}

export async function fetchRoots(signal?: AbortSignal): Promise<FsRoot[]> {
  const res = await fetch("/api/fs/roots", { signal });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return ((await res.json()) as { roots: FsRoot[] }).roots;
}

export async function fetchListing(
  path: string,
  signal?: AbortSignal
): Promise<DirListing> {
  const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`, {
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as DirListing;
}

export async function fetchDirSize(
  path: string,
  signal?: AbortSignal
): Promise<{ bytes: number; partial: boolean }> {
  const res = await fetch(`/api/fs/dirsize?path=${encodeURIComponent(path)}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as { bytes: number; partial: boolean };
}

export function downloadUrl(path: string): string {
  return `/api/fs/download?path=${encodeURIComponent(path)}`;
}

export async function readTextFile(
  path: string,
  signal?: AbortSignal
): Promise<{ path: string; content: string }> {
  const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`, {
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as { path: string; content: string };
}

export function writeTextFile(
  path: string,
  content: string
): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/write", { path, content });
}

/** POSTs JSON to an /api endpoint and surfaces the server's error message. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function createFolder(path: string, name: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/folder", { path, name });
}

export function createFile(path: string, name: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/file", { path, name });
}

export function renameEntry(path: string, newName: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/rename", { path, newName });
}

export function moveEntry(path: string, dest: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/move", { path, dest });
}

export function copyEntry(path: string, dest: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/copy", { path, dest });
}

export function deleteEntry(path: string): Promise<{ ok: true }> {
  return postJson("/api/fs/delete", { path });
}

/** Streams a single File to the given directory; reports progress 0..1. */
export function uploadFile(
  dir: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const url = `/api/fs/upload?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(
    file.name
  )}`;
  // XHR (not fetch) so we get upload progress events.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let msg = `Upload failed: ${xhr.status}`;
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch {
          // non-JSON error body; keep the generic message
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(file);
  });
}

export function formatDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(fromMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - fromMs);
  const s = Math.floor(diff / 1000);
  if (s < 1) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatUptime(seconds: number): string {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}
