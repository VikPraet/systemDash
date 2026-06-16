import { authDb } from "./db.js";

// Resolves an IP address to a coarse geographic location ("where from") for the
// sessions list and audit log. Local/private addresses are classified offline;
// public addresses are looked up once via ip-api.com (free, no API key) and the
// result is cached both in memory and in the auth DB so we never re-fetch the
// same address.

export type GeoStatus = "local" | "resolved" | "unknown";

export interface GeoLocation {
  status: GeoStatus;
  label: string; // human summary, e.g. "Berlin, Germany" or "Local network"
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null; // ISO 3166-1 alpha-2, used for a flag in the UI
  lat: number | null;
  lon: number | null;
}

// ip-api.com free tier: HTTP only, no key, 45 req/min, batch of up to 100.
const IP_API_BATCH = "http://ip-api.com/batch";
const IP_API_FIELDS = "status,message,country,countryCode,regionName,city,lat,lon,query";
const FETCH_TIMEOUT_MS = 4000;
// How long to wait before retrying an address we previously failed to resolve
// (e.g. the server was offline). Successful results are cached indefinitely.
const RETRY_FAILED_MS = 10 * 60 * 1000;

const memCache = new Map<string, GeoLocation>();
// Tracks the last time we *failed* to resolve a public IP so we back off.
const failedAt = new Map<string, number>();

/** Strips the IPv4-mapped IPv6 prefix and zone id so ranges compare cleanly. */
function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  return ip;
}

type IpClass = "loopback" | "private" | "public" | "invalid";

/** Classifies a dotted-quad IPv4 address by its reserved ranges. */
function classifyV4(o: number[]): IpClass {
  if (o.some((n) => n > 255)) return "invalid";
  if (o[0] === 127) return "loopback";
  if (o[0] === 10) return "private";
  if (o[0] === 192 && o[1] === 168) return "private";
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return "private";
  if (o[0] === 169 && o[1] === 254) return "private"; // link-local
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return "private"; // CGNAT
  return "public";
}

/** Classifies an IPv6 address (best-effort; only local ranges are special). */
function classifyV6(ip: string): IpClass {
  if (ip.startsWith("fe80")) return "private"; // link-local
  if (/^f[cd]/.test(ip)) return "private"; // unique local fc00::/7
  return "public";
}

/** Categorises an IP without any network call. */
function classifyIp(ip: string): IpClass {
  if (!ip) return "invalid";
  if (ip === "::1" || ip === "0.0.0.0" || ip === "::") return "loopback";

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) return classifyV4(v4.slice(1, 5).map(Number));
  if (ip.includes(":")) return classifyV6(ip);
  return "invalid";
}

function localLocation(label: string): GeoLocation {
  return {
    status: "local",
    label,
    city: null,
    region: null,
    country: null,
    countryCode: null,
    lat: null,
    lon: null,
  };
}

function unknownLocation(): GeoLocation {
  return {
    status: "unknown",
    label: "Unknown location",
    city: null,
    region: null,
    country: null,
    countryCode: null,
    lat: null,
    lon: null,
  };
}

interface GeoRow {
  ip: string;
  status: string;
  label: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  lat: number | null;
  lon: number | null;
}

function rowToLocation(r: GeoRow): GeoLocation {
  return {
    status: (r.status as GeoStatus) ?? "unknown",
    label: r.label ?? "Unknown location",
    city: r.city,
    region: r.region,
    country: r.country,
    countryCode: r.country_code,
    lat: r.lat,
    lon: r.lon,
  };
}

function readCache(ip: string): GeoLocation | null {
  const mem = memCache.get(ip);
  if (mem) return mem;
  const row = authDb()
    .prepare("SELECT * FROM geo_cache WHERE ip = ?")
    .get(ip) as unknown as GeoRow | undefined;
  if (!row) return null;
  const loc = rowToLocation(row);
  memCache.set(ip, loc);
  return loc;
}

function writeCache(ip: string, loc: GeoLocation): void {
  memCache.set(ip, loc);
  try {
    authDb()
      .prepare(
        `INSERT INTO geo_cache (ip, status, label, city, region, country, country_code, lat, lon, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET
           status=excluded.status, label=excluded.label, city=excluded.city,
           region=excluded.region, country=excluded.country,
           country_code=excluded.country_code, lat=excluded.lat, lon=excluded.lon,
           resolved_at=excluded.resolved_at`
      )
      .run(
        ip,
        loc.status,
        loc.label,
        loc.city,
        loc.region,
        loc.country,
        loc.countryCode,
        loc.lat,
        loc.lon,
        Date.now()
      );
  } catch (err) {
    console.error("failed to cache geo location:", err);
  }
}

interface IpApiResult {
  status: string;
  message?: string;
  query: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

function buildLabel(city?: string, region?: string, country?: string): string {
  const place = city || region;
  if (place && country) return `${place}, ${country}`;
  if (country) return country;
  if (place) return place;
  return "Unknown location";
}

/** Looks up a batch of public IPs via ip-api.com. Returns a map of ip->location. */
async function fetchBatch(ips: string[]): Promise<Map<string, GeoLocation>> {
  const out = new Map<string, GeoLocation>();
  if (ips.length === 0) return out;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${IP_API_BATCH}?fields=${IP_API_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ips),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ip-api responded ${res.status}`);
    const data = (await res.json()) as IpApiResult[];
    for (const r of data) {
      if (r.status === "success") {
        out.set(r.query, {
          status: "resolved",
          label: buildLabel(r.city, r.regionName, r.country),
          city: r.city ?? null,
          region: r.regionName ?? null,
          country: r.country ?? null,
          countryCode: r.countryCode ?? null,
          lat: r.lat ?? null,
          lon: r.lon ?? null,
        });
      }
      // Non-success entries (reserved/invalid as seen by ip-api) are left out;
      // the caller marks them unknown and schedules a retry.
    }
  } catch (err) {
    console.warn("geo lookup failed:", (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
  return out;
}

// Resolves an IP we can answer for without a network round-trip (local range,
// cache hit, or recently-failed backoff). Returns null when a fetch is needed.
function immediateLocation(ip: string, now: number): GeoLocation | null {
  const kind = classifyIp(ip);
  if (kind === "loopback") return localLocation("Localhost");
  if (kind === "private") return localLocation("Local network");
  if (kind === "invalid") return unknownLocation();

  const cached = readCache(ip);
  if (cached) return cached;

  const last = failedAt.get(ip);
  if (last && now - last < RETRY_FAILED_MS) return unknownLocation();
  return null; // public + uncached -> caller should fetch
}

/**
 * Resolves a set of IPs to locations. Local/cached addresses resolve instantly;
 * uncached public addresses are fetched in one batch. Never throws.
 */
export async function resolveLocations(
  rawIps: Array<string | null | undefined>
): Promise<Map<string, GeoLocation>> {
  const result = new Map<string, GeoLocation>();
  const toFetch = new Set<string>();
  const now = Date.now();

  for (const raw of rawIps) {
    if (!raw) continue;
    const ip = normalizeIp(raw);
    if (result.has(ip)) continue;

    const immediate = immediateLocation(ip, now);
    if (immediate) result.set(ip, immediate);
    else toFetch.add(ip);
  }

  if (toFetch.size > 0) {
    const fetched = await fetchBatch([...toFetch]);
    for (const ip of toFetch) {
      const loc = fetched.get(ip);
      if (loc) {
        writeCache(ip, loc);
        failedAt.delete(ip);
        result.set(ip, loc);
      } else {
        failedAt.set(ip, Date.now());
        result.set(ip, unknownLocation());
      }
    }
  }

  return result;
}

/** Returns the location for a single normalized IP, if already resolved/known. */
export function normalizeForLookup(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return normalizeIp(raw);
}
