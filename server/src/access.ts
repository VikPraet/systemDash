import { promises as fsp } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.js";
import {
  addCloudflaredIngress,
  discoverCloudflaredIngress,
  hostnameFromSiteUrl,
  invalidateCloudflaredCache,
  sanitizeIngressHostname,
  type AddIngressResult,
  type IngressDiscovery,
  type IngressRoute,
} from "./cloudflared.js";
import { ProjectsError } from "./projects.js";

const ACCESS_FILE = path.join(DATA_DIR, "access.json");

export type AccessMode = "local-config" | "dashboard" | "running-unread" | "missing";

export interface PublicAccessStatus {
  port: number;
  origin: string;
  self: IngressRoute | null;
  rememberedHostname: string | null;
  conflict: IngressRoute | null;
  canWrite: boolean;
  mode: AccessMode;
  ingress: IngressDiscovery;
}

export interface PublicAccessResult extends PublicAccessStatus {
  result: AddIngressResult | null;
  notice: string | null;
}

export function listenPort(): number {
  const n = Number(process.env.PORT ?? 3001);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 3001;
}

function accessMode(ingress: IngressDiscovery): AccessMode {
  if (ingress.sources.length > 0) return "local-config";
  if (ingress.remotelyManaged) return "dashboard";
  if (ingress.running) return "running-unread";
  return "missing";
}

async function rememberedHostname(): Promise<string | null> {
  try {
    const raw = await fsp.readFile(ACCESS_FILE, "utf8");
    const data = JSON.parse(raw) as { hostname?: unknown };
    const host = hostnameFromSiteUrl(typeof data.hostname === "string" ? data.hostname : "");
    return host;
  } catch {
    return null;
  }
}

async function saveRememberedHostname(hostname: string): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(
    ACCESS_FILE,
    `${JSON.stringify({ hostname, updatedAt: Date.now() }, null, 2)}\n`,
    "utf8"
  );
}

export async function getPublicAccess(opts?: {
  force?: boolean;
}): Promise<PublicAccessStatus> {
  if (opts?.force) invalidateCloudflaredCache();
  const port = listenPort();
  const ingress = await discoverCloudflaredIngress();
  const remembered = await rememberedHostname();
  const byPort = ingress.routes.filter((r) => r.port === port);
  const live =
    (remembered
      ? byPort.find((r) => r.hostname.toLowerCase() === remembered)
      : undefined) ??
    byPort[0] ??
    null;
  const named = remembered
    ? ingress.routes.find((r) => r.hostname.toLowerCase() === remembered) ?? null
    : null;
  const conflict = named && named.port !== port ? named : null;

  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    self: live,
    rememberedHostname: remembered,
    conflict,
    canWrite: ingress.sources.length > 0,
    mode: accessMode(ingress),
    ingress,
  };
}

export async function setPublicAccessHostname(raw: string): Promise<PublicAccessResult> {
  const hostname = sanitizeIngressHostname(raw);
  const current = await getPublicAccess({ force: true });
  await saveRememberedHostname(hostname);

  if (current.canWrite) {
    const result = await addCloudflaredIngress({ hostname, port: current.port });
    const next = await getPublicAccess({ force: true });
    return {
      ...next,
      result,
      notice: accessNotice(result, hostname, current.origin, next.ingress.dnsTarget),
    };
  }

  if (current.mode === "dashboard") {
    const next = await getPublicAccess({ force: true });
    return {
      ...next,
      result: null,
      notice:
        "saved the public hostname. Add it in Cloudflare Zero Trust for this tunnel, pointing at " +
        current.origin,
    };
  }

  throw new ProjectsError(
    400,
    current.ingress.note ??
      "no local cloudflared config.yml was readable — set CLOUDFLARED_CONFIG or add the hostname in Cloudflare"
  );
}

function accessNotice(
  result: AddIngressResult,
  hostname: string,
  origin: string,
  dnsTarget: string | null | undefined
): string {
  const wired = result.already
    ? `${hostname} already points at this dashboard`
    : result.updated
      ? `updated ${hostname} → ${origin}`
      : `added ${hostname} → ${origin}`;
  if (result.dns && /^DNS CNAME created/i.test(result.dns)) {
    return `${wired}. DNS is set — wait a minute, then open https://${hostname}`;
  }
  if (dnsTarget) {
    return `${wired}. If it isn't live, add a CNAME in Cloudflare DNS: ${hostname} → ${dnsTarget} (Proxied)`;
  }
  if (result.dns) return `${wired}. ${result.dns}`;
  return wired;
}
