import si from "systeminformation";
import {
  resolveLocations,
  resolveSelfLocation,
  normalizeForLookup,
  type GeoLocation,
} from "./geo.js";
import {
  collectTcpBytes,
  deriveByteRates,
  inferDirection,
  resolveHostnames,
  serviceFor,
  tcpByteKey,
  type ConnDirection,
  type TcpByteMap,
} from "./networkMeta.js";

export type ConnectionKind = "remote" | "local" | "listening";
export type { ConnDirection };

export interface NetworkInterfaceStat {
  iface: string;
  operstate: string;
  rxSec: number | null;
  txSec: number | null;
  rxBytes: number;
  txBytes: number;
}

export interface NetworkConnection {
  protocol: string;
  localAddress: string;
  localPort: string;
  peerAddress: string;
  peerPort: string;
  state: string;
  pid: number;
  process: string;
  kind: ConnectionKind;
  location: GeoLocation | null;
  /** Inferred service label (HTTPS, SSH, …). */
  service: string;
  /** outbound = we dialed them; inbound = they dialed us. */
  direction: ConnDirection;
  /** Reverse-DNS hostname for the peer, when resolved. */
  peerHost: string | null;
  /** Lifetime bytes received on this TCP socket (null if OS unavailable). */
  bytesIn: number | null;
  /** Lifetime bytes sent on this TCP socket (null if OS unavailable). */
  bytesOut: number | null;
  /** Estimated receive rate (null if unavailable / first sample). */
  rxSec: number | null;
  /** Estimated send rate (null if unavailable / first sample). */
  txSec: number | null;
}

export interface NetworkSnapshot {
  timestamp: number;
  origin: GeoLocation | null;
  interfaces: NetworkInterfaceStat[];
  summary: {
    all: number;
    remote: number;
    local: number;
    listening: number;
  };
  /** True when per-connection byte counters are populated. */
  bytesAvailable: boolean;
  connections: NetworkConnection[];
}

const TTL_MS = 1500;
const MAX_CONNECTIONS = 500;
const PID_NAME_TTL_MS = 5000;

let cache: NetworkSnapshot | null = null;
let cacheAt = 0;
let refreshing = false;

let prevIface: Awaited<ReturnType<typeof si.networkStats>> | null = null;
let prevIfaceAt = 0;

let prevTcpBytes: TcpByteMap | null = null;
let prevTcpBytesAt = 0;

let pidNames = new Map<number, string>();
let pidNamesAt = 0;

async function getPidNames(): Promise<Map<number, string>> {
  if (pidNames.size > 0 && Date.now() - pidNamesAt < PID_NAME_TTL_MS) {
    return pidNames;
  }
  try {
    const p = await si.processes();
    const map = new Map<number, string>();
    for (const x of p.list) {
      if (x.pid > 0 && x.name) map.set(x.pid, x.name);
    }
    pidNames = map;
    pidNamesAt = Date.now();
  } catch {
    // Keep the previous map if process enumeration fails.
  }
  return pidNames;
}

function isHeaderRow(c: {
  protocol: string;
  peerAddress: string;
  localAddress: string;
}): boolean {
  const proto = (c.protocol ?? "").toLowerCase();
  return (
    proto === "proto" ||
    c.peerAddress === "Address" ||
    c.localAddress === "Local"
  );
}

function normalizeIp(raw: string): string {
  let ip = (raw ?? "").trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  return ip;
}

function isLoopback(ip: string): boolean {
  const n = normalizeIp(ip);
  return n === "127.0.0.1" || n === "::1" || n.startsWith("127.");
}

function isUnspecified(ip: string): boolean {
  const n = normalizeIp(ip);
  return !n || n === "0.0.0.0" || n === "::" || n === "*";
}

function classify(state: string, peerAddress: string): ConnectionKind {
  const st = (state ?? "").toUpperCase();
  if (st === "LISTEN" || st === "LISTENING") return "listening";
  if (isUnspecified(peerAddress) || isLoopback(peerAddress)) return "local";
  return "remote";
}

function kindRank(kind: ConnectionKind): number {
  if (kind === "remote") return 0;
  if (kind === "listening") return 1;
  return 2;
}

function rateOrDerive(
  current: number,
  currentSec: number | null | undefined,
  prev: number | undefined,
  dtSec: number
): number | null {
  if (typeof currentSec === "number" && Number.isFinite(currentSec)) {
    return Math.max(0, currentSec);
  }
  if (prev != null && dtSec > 0) {
    return Math.max(0, (current - prev) / dtSec);
  }
  return null;
}

async function collectInterfaces(): Promise<NetworkInterfaceStat[]> {
  const stats = await si.networkStats();
  const now = Date.now();
  const dtSec = prevIfaceAt > 0 ? (now - prevIfaceAt) / 1000 : 0;

  const interfaces = stats
    .filter((s) => s.iface && s.operstate !== "down")
    .map((s) => {
      const prev = prevIface?.find((p) => p.iface === s.iface);
      return {
        iface: s.iface,
        operstate: s.operstate ?? "unknown",
        rxSec: rateOrDerive(s.rx_bytes, s.rx_sec, prev?.rx_bytes, dtSec),
        txSec: rateOrDerive(s.tx_bytes, s.tx_sec, prev?.tx_bytes, dtSec),
        rxBytes: s.rx_bytes ?? 0,
        txBytes: s.tx_bytes ?? 0,
      };
    });

  prevIface = stats;
  prevIfaceAt = now;
  return interfaces;
}

async function refresh(): Promise<void> {
  const [rawConns, interfaces, names, origin, tcpBytes] = await Promise.all([
    si.networkConnections(),
    collectInterfaces(),
    getPidNames(),
    resolveSelfLocation(),
    collectTcpBytes(),
  ]);

  const now = Date.now();
  const dtSec = prevTcpBytesAt > 0 ? (now - prevTcpBytesAt) / 1000 : 0;
  const tcpRates = deriveByteRates(prevTcpBytes, tcpBytes, dtSec);
  prevTcpBytes = tcpBytes.size > 0 ? tcpBytes : prevTcpBytes;
  if (tcpBytes.size > 0) prevTcpBytesAt = now;

  type Mapped = Omit<
    NetworkConnection,
    "location" | "peerHost" | "bytesIn" | "bytesOut" | "rxSec" | "txSec"
  >;

  const mapped: Mapped[] = [];
  for (const c of rawConns) {
    if (isHeaderRow(c)) continue;
    const protocol = (c.protocol ?? "").toLowerCase() || "tcp";
    const localAddress = c.localAddress ?? "";
    const localPort = String(c.localPort ?? "");
    const peerAddress = c.peerAddress ?? "";
    const peerPort = String(c.peerPort ?? "");
    const state = (c.state ?? "").toUpperCase() || "—";
    const pid = typeof c.pid === "number" && Number.isFinite(c.pid) ? c.pid : 0;
    const process =
      (c.process && c.process.trim()) ||
      (pid > 0 ? names.get(pid) ?? "" : "") ||
      (pid > 0 ? `pid ${pid}` : "—");
    const kind = classify(state, peerAddress);
    mapped.push({
      protocol,
      localAddress,
      localPort,
      peerAddress,
      peerPort,
      state,
      pid,
      process,
      kind,
      service: serviceFor(protocol, localPort, peerPort),
      direction: inferDirection(localPort, peerPort, state),
    });
  }

  mapped.sort((a, b) => {
    const kr = kindRank(a.kind) - kindRank(b.kind);
    if (kr !== 0) return kr;
    const aEst = a.state === "ESTABLISHED" ? 0 : 1;
    const bEst = b.state === "ESTABLISHED" ? 0 : 1;
    if (aEst !== bEst) return aEst - bEst;
    return a.process.localeCompare(b.process);
  });

  const truncated = mapped.slice(0, MAX_CONNECTIONS);

  const peerIps = truncated
    .filter((c) => c.kind === "remote")
    .map((c) => c.peerAddress);

  const [byIp, byHost] = await Promise.all([
    resolveLocations(peerIps),
    resolveHostnames(peerIps),
  ]);

  const bytesAvailable = tcpBytes.size > 0;

  const connections: NetworkConnection[] = truncated.map((c) => {
    const key = tcpByteKey(
      c.localAddress,
      c.localPort,
      c.peerAddress,
      c.peerPort
    );
    const bytes = tcpBytes.get(key);
    const rates = tcpRates.get(key);
    const geoKey = normalizeForLookup(c.peerAddress);
    const hostKey = normalizeIp(c.peerAddress);

    return {
      ...c,
      location:
        c.kind === "remote" && geoKey ? byIp.get(geoKey) ?? null : null,
      peerHost:
        c.kind === "remote" ? byHost.get(hostKey) ?? null : null,
      bytesIn: bytes ? bytes.bytesIn : null,
      bytesOut: bytes ? bytes.bytesOut : null,
      rxSec: rates ? rates.rxSec : null,
      txSec: rates ? rates.txSec : null,
    };
  });

  const summary = {
    all: mapped.length,
    remote: mapped.filter((c) => c.kind === "remote").length,
    local: mapped.filter((c) => c.kind === "local").length,
    listening: mapped.filter((c) => c.kind === "listening").length,
  };

  cache = {
    timestamp: Date.now(),
    origin,
    interfaces,
    summary,
    bytesAvailable,
    connections,
  };
  cacheAt = Date.now();
}

export async function getNetwork(): Promise<NetworkSnapshot> {
  if (!cache) {
    await refresh();
  } else if (Date.now() - cacheAt > TTL_MS && !refreshing) {
    refreshing = true;
    refresh().finally(() => {
      refreshing = false;
    });
  }
  return cache as NetworkSnapshot;
}
