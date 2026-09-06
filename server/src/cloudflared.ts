import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectContainer, listContainers } from "./docker.js";

const CACHE_MS = 20_000;

export interface IngressRoute {
  hostname: string;
  url: string;
  service: string;
  port: number | null;
  source: string;
}

export interface IngressDiscovery {
  routes: IngressRoute[];
  sources: string[];
  running: boolean;
  remotelyManaged: boolean;
  note: string | null;
}

let cache: { at: number; value: IngressDiscovery } | null = null;

export async function discoverCloudflaredIngress(): Promise<IngressDiscovery> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = await discover();
  cache = { at: Date.now(), value };
  return value;
}

async function discover(): Promise<IngressDiscovery> {
  const files = new Set(candidateFiles());
  let running = cloudflaredServiceActive();
  let remotelyManaged = false;

  const docker = await withTimeout(enrichFromDocker(files), 4000);
  if (docker) {
    running = running || docker.running;
    remotelyManaged = docker.remotelyManaged;
  }

  const routes: IngressRoute[] = [];
  const sources: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const text = readConfigFile(file);
    if (text == null) continue;
    const parsed = parseCloudflaredConfig(text);
    if (parsed.length === 0) continue;
    sources.push(file);
    for (const item of parsed) {
      const url = `https://${item.hostname}`;
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push({
        hostname: item.hostname,
        url,
        service: item.service,
        port: portFromService(item.service),
        source: file,
      });
    }
  }

  routes.sort((a, b) => a.hostname.localeCompare(b.hostname));

  let note: string | null = null;
  if (routes.length === 0) {
    if (remotelyManaged) {
      note =
        "cloudflared is running as a dashboard-managed tunnel (token). Hostnames live in Cloudflare, not a local file — type the public URL.";
    } else if (running) {
      note =
        "cloudflared is running but no local ingress hostnames were readable. Type the URL, or set CLOUDFLARED_CONFIG to the config.yml that lists hostnames.";
    } else {
      note = "Type the public https:// URL. If this host uses a local cloudflared config.yml, hostnames will show up here to pick.";
    }
  }

  return { routes, sources, running, remotelyManaged, note };
}

async function enrichFromDocker(files: Set<string>): Promise<{
  running: boolean;
  remotelyManaged: boolean;
}> {
  let running = false;
  let remotelyManaged = false;
  const containers = await listContainers();
  for (const c of containers) {
    if (!/cloudflared/i.test(c.name) && !/cloudflared/i.test(c.image)) continue;
    running = true;
    try {
      const info = await inspectContainer(c.id);
      if (info.env.some((e) => /^TUNNEL_TOKEN=./.test(e))) remotelyManaged = true;
      const cfgArg = configArgFromArgs(info.args);
      if (cfgArg) files.add(cfgArg);
      for (const mount of info.mounts) {
        if (/cloudflared/i.test(mount.Destination) || /cloudflared/i.test(mount.Source)) {
          addConfigCandidates(files, mount.Source);
          addConfigCandidates(files, mount.Destination);
        }
      }
    } catch {
      // inspect can fail if Docker is flaky; keep going
    }
  }
  return { running, remotelyManaged };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function candidateFiles(): string[] {
  const home = os.homedir();
  const extra = process.env.CLOUDFLARED_CONFIG?.trim();
  const list = [
    extra,
    path.join("/etc/cloudflared", "config.yml"),
    path.join("/etc/cloudflared", "config.yaml"),
    path.join("/etc/cloudflared", "config.json"),
    path.join(home, ".cloudflared", "config.yml"),
    path.join(home, ".cloudflared", "config.yaml"),
    path.join(home, ".cloudflared", "config.json"),
  ];
  if (process.platform === "linux") {
    list.push("/root/.cloudflared/config.yml", "/root/.cloudflared/config.yaml");
    try {
      for (const ent of fs.readdirSync("/home", { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        list.push(
          path.join("/home", ent.name, ".cloudflared", "config.yml"),
          path.join("/home", ent.name, ".cloudflared", "config.yaml")
        );
      }
    } catch {
      // no /home
    }
  }
  if (process.platform === "win32" && process.env.ProgramData) {
    list.push(
      path.join(process.env.ProgramData, "cloudflared", "config.yml"),
      path.join(process.env.ProgramData, "cloudflared", "config.yaml")
    );
  }
  return [...new Set(list.filter((p): p is string => !!p))];
}

function addConfigCandidates(files: Set<string>, dirOrFile: string): void {
  const trimmed = dirOrFile.trim();
  if (!trimmed) return;
  if (/\.(ya?ml|json)$/i.test(trimmed)) {
    files.add(trimmed);
    return;
  }
  files.add(path.join(trimmed, "config.yml"));
  files.add(path.join(trimmed, "config.yaml"));
  files.add(path.join(trimmed, "config.json"));
}

function configArgFromArgs(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) return args[i + 1];
    if (args[i]?.startsWith("--config=")) return args[i].slice("--config=".length);
  }
  return null;
}

function cloudflaredServiceActive(): boolean {
  if (process.platform !== "linux") return false;
  try {
    execFileSync("systemctl", ["is-active", "--quiet", "cloudflared"], {
      timeout: 2500,
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function readConfigFile(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EACCES" && process.platform !== "win32") {
      try {
        return execFileSync("sudo", ["-n", "cat", "--", file], {
          encoding: "utf8",
          timeout: 4000,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function parseCloudflaredConfig(text: string): { hostname: string; service: string }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonConfig(trimmed);
  }
  return parseYamlIngress(text);
}

function parseJsonConfig(text: string): { hostname: string; service: string }[] {
  try {
    const data = JSON.parse(text) as { ingress?: unknown };
    if (!Array.isArray(data.ingress)) return [];
    return data.ingress.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const rec = item as { hostname?: unknown; service?: unknown };
      if (typeof rec.hostname !== "string" || typeof rec.service !== "string") return [];
      if (!isHttpService(rec.service)) return [];
      return [{ hostname: rec.hostname.trim(), service: rec.service.trim() }];
    });
  } catch {
    return [];
  }
}

function parseYamlIngress(text: string): { hostname: string; service: string }[] {
  const lines = text.split(/\r?\n/);
  let inIngress = false;
  let ingressIndent = 0;
  const items: { hostname?: string; service?: string }[] = [];
  let current: { hostname?: string; service?: string } | null = null;

  const flush = () => {
    if (
      current?.hostname &&
      current.service &&
      isHttpService(current.service)
    ) {
      items.push({ hostname: current.hostname, service: current.service });
    }
    current = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const content = line.trim();

    if (!inIngress) {
      if (/^ingress\s*:/.test(content)) {
        inIngress = true;
        ingressIndent = indent;
      }
      continue;
    }

    if (indent <= ingressIndent && !content.startsWith("-") && !/^ingress\s*:/.test(content)) {
      flush();
      break;
    }

    if (content.startsWith("-")) {
      flush();
      current = {};
      const rest = content.replace(/^-\s*/, "");
      assignYamlField(current, rest);
      continue;
    }

    if (current) assignYamlField(current, content);
  }
  flush();
  return items as { hostname: string; service: string }[];
}

function assignYamlField(
  current: { hostname?: string; service?: string },
  content: string
): void {
  const kv = content.match(/^(hostname|service)\s*:\s*(.*)$/);
  if (!kv) return;
  const value = unquote(kv[2] ?? "");
  if (!value) return;
  if (kv[1] === "hostname") current.hostname = value;
  else current.service = value;
}

function unquote(raw: string): string {
  let s = raw.trim();
  const comment = s.search(/\s+#/);
  if (comment >= 0) s = s.slice(0, comment).trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

function isHttpService(service: string): boolean {
  return /^https?:\/\//i.test(service.trim());
}

function portFromService(service: string): number | null {
  try {
    const u = new URL(service);
    if (u.port) return Number(u.port);
    if (u.protocol === "http:") return 80;
    if (u.protocol === "https:") return 443;
  } catch {
    const m = service.match(/:(\d+)\s*$/);
    if (m) return Number(m[1]);
  }
  return null;
}
