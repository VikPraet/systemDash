import { execFile } from "node:child_process";
import { composeServices, dockerComposeAvailable, findContainer } from "./docker.js";
import { type ProjectSummary, type RunKind } from "./projects.js";
import { resolveUnderProject } from "./siteDeploy.js";
import { trafficForHostname, type SiteTraffic } from "./cloudflareAnalytics.js";

const CACHE_MS = 20_000;
const PROBE_MS = 4_000;

export type ProbeState = "up" | "degraded" | "down" | "skipped";
export type OverallState = "up" | "degraded" | "down" | "unknown";
export type RuntimeState = "running" | "stopped" | "missing" | "unknown" | "skipped";

export interface SiteProbe {
  target: string;
  state: ProbeState;
  statusCode: number | null;
  ms: number | null;
  error: string | null;
}

export interface RuntimeStatus {
  kind: RunKind;
  state: RuntimeState;
  detail: string | null;
}

export interface ProjectSiteStatus {
  projectId: number;
  overall: OverallState;
  public: SiteProbe | null;
  origin: SiteProbe | null;
  runtime: RuntimeStatus;
  traffic: SiteTraffic | null;
  checkedAt: number;
}

let cache: { at: number; value: ProjectSiteStatus[] } | null = null;

export function invalidateSiteStatus(): void {
  cache = null;
}

function hostnameFromSiteUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const host = (/^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${raw}`))
      .hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function originUrl(port: number, siteUrl: string | null): string {
  if (siteUrl) {
    try {
      const u = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
      const path = u.pathname && u.pathname !== "" ? u.pathname : "/";
      return `http://127.0.0.1:${port}${path}`;
    } catch {
      // fall through
    }
  }
  return `http://127.0.0.1:${port}/`;
}

function classifyStatus(code: number): ProbeState {
  if (code >= 500) return "degraded";
  if (code >= 200) return "up";
  return "degraded";
}

async function probeHttp(url: string): Promise<SiteProbe> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_MS),
      headers: {
        "User-Agent": "SystemDash-health",
        Accept: "*/*",
      },
    });
    await res.body?.cancel().catch(() => undefined);
    return {
      target: url,
      state: classifyStatus(res.status),
      statusCode: res.status,
      ms: Date.now() - started,
      error: null,
    };
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    const msg = aborted
      ? "timed out"
      : err instanceof Error
        ? err.message.replace(/^fetch failed: /i, "")
        : "request failed";
    return {
      target: url,
      state: "down",
      statusCode: null,
      ms: Date.now() - started,
      error: msg,
    };
  }
}

function systemdUnitName(unit: string): string {
  return unit.endsWith(".service") ? unit : `${unit}.service`;
}

function execQuiet(file: string, args: string[]): Promise<{ ok: boolean; text: string }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: 4_000, windowsHide: true, encoding: "utf8" },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          text: `${stdout || ""}${stderr || ""}`.trim(),
        });
      }
    );
  });
}

async function systemdRuntime(unit: string): Promise<RuntimeStatus> {
  const name = systemdUnitName(unit);
  if (process.platform !== "linux") {
    return { kind: "systemd", state: "unknown", detail: "systemd is only on Linux" };
  }
  const show = ["show", "-p", "ActiveState", "-p", "LoadState", "--value", name];
  for (const args of [show, ["--user", ...show]]) {
    const result = await execQuiet("systemctl", args);
    if (!result.ok && !result.text) continue;
    const lines = result.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const active = lines[0] || "";
    const load = lines[1] || "";
    if (load === "not-found") {
      continue;
    }
    if (active === "active") {
      return {
        kind: "systemd",
        state: "running",
        detail: args[0] === "--user" ? `${name} (user)` : name,
      };
    }
    if (active) {
      return { kind: "systemd", state: "stopped", detail: `${name} is ${active}` };
    }
  }
  return { kind: "systemd", state: "missing", detail: `${name} not found` };
}

async function runtimeFor(project: ProjectSummary): Promise<RuntimeStatus> {
  switch (project.runKind) {
    case "docker": {
      if (!project.container) {
        return { kind: "docker", state: "unknown", detail: "no container name set" };
      }
      try {
        const found = await findContainer(project.container);
        if (!found) {
          return { kind: "docker", state: "missing", detail: `${project.container} not found` };
        }
        return {
          kind: "docker",
          state: found.running ? "running" : "stopped",
          detail: found.status || found.state,
        };
      } catch (err) {
        return {
          kind: "docker",
          state: "unknown",
          detail: err instanceof Error ? err.message : "docker status failed",
        };
      }
    }
    case "compose": {
      if (!dockerComposeAvailable()) {
        return { kind: "compose", state: "unknown", detail: "docker compose is not available" };
      }
      const file = project.composeFile || "compose.yaml";
      try {
        const abs = resolveUnderProject(project.localPath, file);
        const services = await composeServices(project.localPath, abs);
        if (services.length === 0) {
          return { kind: "compose", state: "missing", detail: "no compose services" };
        }
        const running = services.filter((s) => s.running).length;
        const state: RuntimeState =
          running === services.length ? "running" : running > 0 ? "unknown" : "stopped";
        return {
          kind: "compose",
          state,
          detail: `${running}/${services.length} running`,
        };
      } catch (err) {
        return {
          kind: "compose",
          state: "unknown",
          detail: err instanceof Error ? err.message : "compose status failed",
        };
      }
    }
    case "systemd": {
      if (!project.unit) {
        return { kind: "systemd", state: "unknown", detail: "no unit set" };
      }
      return systemdRuntime(project.unit);
    }
    default:
      return { kind: project.runKind, state: "skipped", detail: null };
  }
}

function overallOf(
  pub: SiteProbe | null,
  origin: SiteProbe | null,
  runtime: RuntimeStatus
): OverallState {
  const http = [pub, origin].filter((p): p is SiteProbe => !!p && p.state !== "skipped");
  if (http.length > 0) {
    if (http.some((p) => p.state === "up") && http.every((p) => p.state !== "down")) return "up";
    if (pub?.state === "up") return "up";
    if (pub?.state === "down" && origin?.state === "up") return "degraded";
    if (http.some((p) => p.state === "degraded")) return "degraded";
    if (http.every((p) => p.state === "down")) return "down";
    if (http.some((p) => p.state === "up")) return "degraded";
    return "down";
  }
  if (runtime.state === "running") return "up";
  if (runtime.state === "stopped" || runtime.state === "missing") return "down";
  return "unknown";
}

async function statusFor(project: ProjectSummary): Promise<ProjectSiteStatus> {
  const probes: Array<Promise<unknown>> = [];
  let pub: SiteProbe | null = null;
  let origin: SiteProbe | null = null;

  if (project.siteUrl) {
    probes.push(
      probeHttp(project.siteUrl).then((v) => {
        pub = v;
      })
    );
  }
  if (project.port != null && project.port > 0) {
    probes.push(
      probeHttp(originUrl(project.port, project.siteUrl)).then((v) => {
        origin = v;
      })
    );
  }

  const [runtime] = await Promise.all([runtimeFor(project), ...probes]);

  const host = hostnameFromSiteUrl(project.siteUrl);
  let traffic: SiteTraffic | null = null;
  if (host) {
    traffic = await trafficForHostname(host);
  }

  const checkedAt = Date.now();
  return {
    projectId: project.id,
    overall: overallOf(pub, origin, runtime),
    public: pub,
    origin,
    runtime,
    traffic,
    checkedAt,
  };
}

export async function listSiteStatus(
  projects: ProjectSummary[],
  opts?: { force?: boolean }
): Promise<ProjectSiteStatus[]> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_MS) {
    const ids = new Set(projects.map((p) => p.id));
    if (
      cache.value.length === projects.length &&
      cache.value.every((s) => ids.has(s.projectId))
    ) {
      return cache.value;
    }
  }
  const value = await Promise.all(projects.map((p) => statusFor(p)));
  cache = { at: Date.now(), value };
  return value;
}
