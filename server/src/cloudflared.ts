import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectContainer, listContainers } from "./docker.js";
import { ProjectsError } from "./projects.js";

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

export function invalidateCloudflaredCache(): void {
  cache = null;
}

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

export function hostnameFromSiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const host = (/^https?:\/\//i.test(trimmed) ? new URL(trimmed) : new URL(`https://${trimmed}`))
      .hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export function sanitizeIngressHostname(raw: string): string {
  const host = hostnameFromSiteUrl(raw);
  if (!host || host.includes("*") || !HOSTNAME_RE.test(host)) {
    throw new ProjectsError(400, "cloudflared hostname must be a DNS name");
  }
  return host.toLowerCase();
}

export function insertYamlIngress(text: string, hostname: string, service: string): string {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let inIngress = false;
  let ingressIndent = 0;
  let ingressLine = -1;
  let catchAllIdx = -1;
  let lastDashIdx = -1;
  let itemIndent = 2;
  let sectionEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\t/g, "  ");
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const content = line.trim();
    if (!content || content.startsWith("#")) continue;
    if (!inIngress) {
      if (/^ingress\s*:/.test(content)) {
        inIngress = true;
        ingressIndent = indent;
        ingressLine = i;
      }
      continue;
    }
    if (indent <= ingressIndent && !content.startsWith("-") && !/^ingress\s*:/.test(content)) {
      sectionEnd = i;
      break;
    }
    if (content.startsWith("-")) {
      lastDashIdx = i;
      itemIndent = indent;
      if (/service\s*:\s*http_status:/i.test(content)) catchAllIdx = i;
    }
  }

  if (ingressLine < 0) {
    throw new ProjectsError(400, "cloudflared config has no ingress list to edit");
  }

  const pad = " ".repeat(itemIndent);
  const block = [`${pad}- hostname: ${hostname}`, `${pad}  service: ${service}`];
  const at =
    catchAllIdx >= 0 ? catchAllIdx : lastDashIdx >= 0 ? lastDashIdx + 1 : ingressLine + 1;
  const skip = catchAllIdx >= 0 ? 0 : countItemLines(lines, lastDashIdx >= 0 ? lastDashIdx : at);
  const insertAt = catchAllIdx >= 0 ? catchAllIdx : lastDashIdx >= 0 ? lastDashIdx + skip : at;
  void sectionEnd;
  lines.splice(insertAt, 0, ...block);
  return lines.join(nl);
}

function countItemLines(lines: string[], dashIdx: number): number {
  if (dashIdx < 0) return 1;
  const base = (lines[dashIdx].match(/^ */)?.[0].length ?? 0);
  let n = 1;
  for (let i = dashIdx + 1; i < lines.length; i++) {
    const content = lines[i].trim();
    if (!content || content.startsWith("#")) {
      n += 1;
      continue;
    }
    const indent = lines[i].match(/^ */)?.[0].length ?? 0;
    if (content.startsWith("-") && indent <= base) break;
    if (indent <= base && !content.startsWith("-")) break;
    n += 1;
  }
  return n;
}

function insertJsonIngress(text: string, hostname: string, service: string): string {
  const data = JSON.parse(text) as { ingress?: Array<Record<string, unknown>> };
  if (!Array.isArray(data.ingress)) data.ingress = [];
  const entry = { hostname, service };
  const catchIdx = data.ingress.findIndex((item) =>
    String(item.service ?? "").startsWith("http_status:")
  );
  if (catchIdx >= 0) data.ingress.splice(catchIdx, 0, entry);
  else data.ingress.push(entry);
  return `${JSON.stringify(data, null, 2)}\n`;
}

function writeConfigFile(file: string, text: string): void {
  try {
    fs.accessSync(file, fs.constants.W_OK);
    fs.copyFileSync(file, `${file}.bak`);
    fs.writeFileSync(file, text, "utf8");
    return;
  } catch {
    // fall through to sudo
  }
  if (process.platform === "win32") {
    throw new ProjectsError(400, `cannot write ${file}`);
  }
  try {
    execFileSync("sudo", ["-n", "cp", "--", file, `${file}.bak`], {
      timeout: 5000,
      stdio: "pipe",
      windowsHide: true,
    });
  } catch {
    // backup is best-effort
  }
  try {
    execFileSync("sudo", ["-n", "tee", "--", file], {
      input: text,
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    throw new ProjectsError(
      400,
      `cannot write ${file} — allow passwordless sudo tee for this file, or chown it to the SystemDash user`
    );
  }
}

function tunnelNameFromConfig(text: string): string | null {
  const m = text.match(/^\s*tunnel\s*:\s*(.+)$/m);
  if (!m) return null;
  const name = unquote(m[1] ?? "");
  return name || null;
}

function tryDnsRoute(tunnel: string, hostname: string): string | null {
  try {
    execFileSync("cloudflared", ["tunnel", "route", "dns", tunnel, hostname], {
      timeout: 20_000,
      stdio: "pipe",
      windowsHide: true,
    });
    return `DNS CNAME created for ${hostname}`;
  } catch (e) {
    const msg = ((e as { stderr?: Buffer | string }).stderr ?? (e as Error).message ?? "")
      .toString()
      .trim();
    return msg ? `DNS not updated (${msg.slice(0, 180)})` : "DNS not updated — add a CNAME in Cloudflare";
  }
}

async function reloadCloudflared(): Promise<string | null> {
  if (process.platform === "linux") {
    try {
      execFileSync("sudo", ["-n", "systemctl", "restart", "cloudflared"], {
        timeout: 20_000,
        stdio: "pipe",
        windowsHide: true,
      });
      return "restarted cloudflared.service";
    } catch {
      try {
        execFileSync("systemctl", ["restart", "cloudflared"], {
          timeout: 20_000,
          stdio: "pipe",
          windowsHide: true,
        });
        return "restarted cloudflared.service";
      } catch {
        // try docker
      }
    }
  }
  try {
    const containers = await listContainers();
    const hit = containers.find(
      (c) => /cloudflared/i.test(c.name) || /cloudflared/i.test(c.image)
    );
    if (hit) {
      execFileSync("docker", ["restart", hit.id], {
        timeout: 30_000,
        stdio: "pipe",
        windowsHide: true,
      });
      return `restarted container ${hit.name}`;
    }
  } catch {
    // ignore
  }
  return "config saved — restart cloudflared so the new hostname is live";
}

export interface AddIngressResult {
  added: boolean;
  already: boolean;
  file: string | null;
  reloaded: string | null;
  dns: string | null;
  ingress: IngressDiscovery;
}

export async function addCloudflaredIngress(opts: {
  hostname: string;
  port: number;
}): Promise<AddIngressResult> {
  const hostname = sanitizeIngressHostname(opts.hostname);
  const port = opts.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ProjectsError(400, "set a port so cloudflared can proxy to localhost");
  }
  const service = `http://127.0.0.1:${port}`;

  invalidateCloudflaredCache();
  const current = await discoverCloudflaredIngress();
  if (current.routes.some((r) => r.hostname.toLowerCase() === hostname)) {
    return {
      added: false,
      already: true,
      file: current.routes.find((r) => r.hostname.toLowerCase() === hostname)?.source ?? null,
      reloaded: null,
      dns: null,
      ingress: current,
    };
  }
  if (current.remotelyManaged && current.sources.length === 0) {
    throw new ProjectsError(
      400,
      "this tunnel is dashboard-managed — add the hostname in Cloudflare Zero Trust, not a local file"
    );
  }

  let file = current.sources[0] ?? null;
  if (!file) {
    for (const candidate of candidateFiles()) {
      const text = readConfigFile(candidate);
      if (text && /^\s*ingress\s*:/m.test(text)) {
        file = candidate;
        break;
      }
    }
  }
  if (!file) {
    throw new ProjectsError(
      400,
      "no local cloudflared config.yml with an ingress list was writable"
    );
  }

  const original = readConfigFile(file);
  if (original == null) {
    throw new ProjectsError(400, `could not read ${file}`);
  }
  const next = original.trimStart().startsWith("{")
    ? insertJsonIngress(original, hostname, service)
    : insertYamlIngress(original, hostname, service);
  writeConfigFile(file, next);

  const reloaded = await reloadCloudflared();
  const tunnel = tunnelNameFromConfig(original);
  const dns = tunnel ? tryDnsRoute(tunnel, hostname) : "DNS not updated — add a CNAME in Cloudflare";

  invalidateCloudflaredCache();
  const ingress = await discoverCloudflaredIngress();
  return { added: true, already: false, file, reloaded, dns, ingress };
}

