import { projectsDb, ProjectsError } from "./projects.js";

const ZONES_CACHE_MS = 10 * 60_000;
const TRAFFIC_CACHE_MS = 60_000;
const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const API = "https://api.cloudflare.com/client/v4";

export interface CloudflareAccountPublic {
  connected: boolean;
  email: string | null;
  tokenLast4: string | null;
  source: "stored" | "env" | null;
}

export interface SiteTraffic {
  requests24h: number | null;
  visits24h: number | null;
  bytes24h: number | null;
  error: string | null;
}

interface StoredAccount {
  token: string;
  email: string | null;
  tokenLast4: string;
  createdAt: number;
}

interface ZoneRow {
  id: string;
  name: string;
}

let zonesCache: { at: number; token: string; zones: ZoneRow[] } | null = null;
const trafficCache = new Map<string, { at: number; value: SiteTraffic }>();

function tokenLast4(token: string): string {
  const t = token.trim();
  if (t.length <= 4) return t;
  return t.slice(-4);
}

function storedAccount(): StoredAccount | null {
  const row = projectsDb()
    .prepare("SELECT token, email, token_last4, created_at FROM cloudflare_account WHERE id = 1")
    .get() as
    | { token: string; email: string | null; token_last4: string; created_at: number }
    | undefined;
  if (!row) return null;
  return {
    token: row.token,
    email: row.email,
    tokenLast4: row.token_last4,
    createdAt: row.created_at,
  };
}

export function cloudflareToken(): { token: string; source: "stored" | "env" } | null {
  const stored = storedAccount();
  if (stored?.token) return { token: stored.token, source: "stored" };
  const env = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (env) return { token: env, source: "env" };
  return null;
}

export function getCloudflareAccountPublic(): CloudflareAccountPublic {
  const stored = storedAccount();
  if (stored) {
    return {
      connected: true,
      email: stored.email,
      tokenLast4: stored.tokenLast4,
      source: "stored",
    };
  }
  const env = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (env) {
    return {
      connected: true,
      email: null,
      tokenLast4: tokenLast4(env),
      source: "env",
    };
  }
  return { connected: false, email: null, tokenLast4: null, source: null };
}

export function deleteCloudflareAccount(): void {
  projectsDb().prepare("DELETE FROM cloudflare_account WHERE id = 1").run();
  zonesCache = null;
  trafficCache.clear();
}

function invalidateTraffic(): void {
  zonesCache = null;
  trafficCache.clear();
}

async function cfFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: T;
  };
  if (!res.ok || body.success === false) {
    const msg =
      body.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      `Cloudflare API error (${res.status})`;
    throw new ProjectsError(res.status === 401 || res.status === 403 ? 400 : 502, msg);
  }
  return body.result as T;
}

export async function connectCloudflareAccount(token: string): Promise<CloudflareAccountPublic> {
  const trimmed = token.trim();
  if (!trimmed) throw new ProjectsError(400, "token is required");
  if (trimmed.length > 200) throw new ProjectsError(400, "token is too long");

  const verified = await cfFetch<{ status?: string }>(trimmed, "/user/tokens/verify");
  if (verified && typeof verified.status === "string" && verified.status !== "active") {
    throw new ProjectsError(400, `Cloudflare token is ${verified.status}`);
  }

  let email: string | null = null;
  try {
    const accounts = await cfFetch<Array<{ name?: string }>>(trimmed, "/accounts?per_page=1");
    email = accounts[0]?.name?.trim() || null;
  } catch {
    try {
      const user = await cfFetch<{ email?: string }>(trimmed, "/user");
      email = user.email?.trim() || null;
    } catch {
      email = null;
    }
  }

  projectsDb()
    .prepare(
      `INSERT INTO cloudflare_account (id, token, email, token_last4, created_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         token = excluded.token,
         email = excluded.email,
         token_last4 = excluded.token_last4,
         created_at = excluded.created_at`
    )
    .run(trimmed, email, tokenLast4(trimmed), Date.now());
  invalidateTraffic();
  return getCloudflareAccountPublic();
}

async function listZones(token: string): Promise<ZoneRow[]> {
  if (zonesCache && zonesCache.token === token && Date.now() - zonesCache.at < ZONES_CACHE_MS) {
    return zonesCache.zones;
  }
  const zones: ZoneRow[] = [];
  let page = 1;
  while (page <= 8) {
    const res = await fetch(`${API}/zones?per_page=50&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      result?: Array<{ id?: string; name?: string }>;
      result_info?: { total_pages?: number };
      errors?: Array<{ message?: string }>;
    };
    if (!res.ok || body.success === false) {
      const msg =
        body.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
        `Cloudflare zone list failed (${res.status})`;
      throw new Error(msg);
    }
    for (const z of body.result ?? []) {
      if (z.id && z.name) zones.push({ id: z.id, name: z.name.toLowerCase() });
    }
    const total = body.result_info?.total_pages ?? page;
    if (page >= total) break;
    page += 1;
  }
  zonesCache = { at: Date.now(), token, zones };
  return zones;
}

function zoneForHost(host: string, zones: ZoneRow[]): ZoneRow | null {
  const h = host.toLowerCase();
  let best: ZoneRow | null = null;
  for (const z of zones) {
    if (h === z.name || h.endsWith(`.${z.name}`)) {
      if (!best || z.name.length > best.name.length) best = z;
    }
  }
  return best;
}

async function zoneForHostname(token: string, hostname: string): Promise<ZoneRow | null> {
  try {
    const zones = await listZones(token);
    const match = zoneForHost(hostname, zones);
    if (match) return match;
  } catch {
    // Token may not allow listing all zones — try exact suffixes instead.
  }
  const labels = hostname.toLowerCase().split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const name = labels.slice(i).join(".");
    try {
      const rows = await cfFetch<Array<{ id: string; name: string }>>(
        token,
        `/zones?name=${encodeURIComponent(name)}`
      );
      const hit = rows.find((z) => z.name.toLowerCase() === name);
      if (hit) return { id: hit.id, name: hit.name.toLowerCase() };
    } catch {
      // keep trying shorter suffixes
    }
  }
  return null;
}

const TRAFFIC_QUERY = `
query SiteTraffic($zoneTag: string, $start: Time, $end: Time, $host: string) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(
        limit: 1
        filter: {
          datetime_geq: $start
          datetime_lt: $end
          clientRequestHTTPHost: $host
          requestSource: "eyeball"
        }
      ) {
        count
        avg { sampleInterval }
        sum {
          visits
          edgeResponseBytes
        }
      }
    }
  }
}
`;

async function queryTraffic(
  token: string,
  zoneId: string,
  hostname: string
): Promise<SiteTraffic> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      query: TRAFFIC_QUERY,
      variables: {
        zoneTag: zoneId,
        start: start.toISOString(),
        end: end.toISOString(),
        host: hostname,
      },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: {
      viewer?: {
        zones?: Array<{
          httpRequestsAdaptiveGroups?: Array<{
            count?: number;
            avg?: { sampleInterval?: number };
            sum?: { visits?: number; edgeResponseBytes?: number };
          }>;
        }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || body.errors?.length) {
    const msg =
      body.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      `Cloudflare analytics failed (${res.status})`;
    return { requests24h: null, visits24h: null, bytes24h: null, error: msg };
  }
  const group = body.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0];
  if (!group) {
    return { requests24h: 0, visits24h: 0, bytes24h: 0, error: null };
  }
  const sample = group.avg?.sampleInterval && group.avg.sampleInterval > 0
    ? group.avg.sampleInterval
    : 1;
  const requests = Math.round((group.count ?? 0) * sample);
  return {
    requests24h: requests,
    visits24h: Math.round(group.sum?.visits ?? 0),
    bytes24h: Math.round(group.sum?.edgeResponseBytes ?? 0),
    error: null,
  };
}

export async function trafficForHostname(hostname: string): Promise<SiteTraffic | null> {
  const auth = cloudflareToken();
  if (!auth) return null;
  const host = hostname.trim().toLowerCase();
  if (!host) return null;
  const cached = trafficCache.get(host);
  if (cached && Date.now() - cached.at < TRAFFIC_CACHE_MS) return cached.value;

  let value: SiteTraffic;
  try {
    const zone = await zoneForHostname(auth.token, host);
    if (!zone) {
      value = {
        requests24h: null,
        visits24h: null,
        bytes24h: null,
        error: "no Cloudflare zone for this hostname",
      };
    } else {
      value = await queryTraffic(auth.token, zone.id, host);
    }
  } catch (err) {
    value = {
      requests24h: null,
      visits24h: null,
      bytes24h: null,
      error: err instanceof Error ? err.message : "Cloudflare analytics failed",
    };
  }
  trafficCache.set(host, { at: Date.now(), value });
  return value;
}

export function cloudflareHint(): string | null {
  if (cloudflareToken()) return null;
  return "Connect Cloudflare to see visits for the last 24 hours (Zone Analytics on the hostnames this tunnel serves).";
}
