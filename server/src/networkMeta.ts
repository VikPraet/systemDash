import { promises as dns } from "node:dns";
import { spawn } from "node:child_process";

export type ConnDirection = "outbound" | "inbound" | "peer";

/** Common TCP/UDP service names by port. */
const SERVICES: Record<number, string> = {
  20: "FTP data",
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  123: "NTP",
  143: "IMAP",
  443: "HTTPS",
  465: "SMTPS",
  587: "SMTP",
  993: "IMAPS",
  995: "POP3S",
  1194: "OpenVPN",
  1433: "MSSQL",
  1521: "Oracle",
  3306: "MySQL",
  3389: "RDP",
  5432: "Postgres",
  5900: "VNC",
  6379: "Redis",
  8080: "HTTP",
  8443: "HTTPS",
  27017: "MongoDB",
  51820: "WireGuard",
  5353: "mDNS",
  1900: "SSDP",
  5355: "LLMNR",
  853: "DoT",
  5222: "XMPP",
  5223: "APNs",
  5228: "Google",
  19302: "WebRTC",
  3478: "STUN",
  500: "IKE",
  4500: "IPsec NAT",
  8530: "WSUS",
  445: "SMB",
  139: "NetBIOS",
  135: "RPC",
  88: "Kerberos",
  389: "LDAP",
  636: "LDAPS",
};

function portNum(raw: string): number {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

export function isWellKnownPort(port: number): boolean {
  return port > 0 && (port < 1024 || port in SERVICES);
}

export function serviceFor(protocol: string, localPort: string, peerPort: string): string {
  const lp = portNum(localPort);
  const pp = portNum(peerPort);
  const proto = protocol.toLowerCase();
  if (SERVICES[pp]) return SERVICES[pp];
  if (SERVICES[lp]) return SERVICES[lp];
  if (pp > 0) return `${proto.toUpperCase()} ${pp}`;
  if (lp > 0) return `${proto.toUpperCase()} ${lp}`;
  return proto.toUpperCase() || "Unknown";
}

/**
 * Heuristic direction: outbound = we dialed a well-known peer port;
 * inbound = they dialed a well-known local port.
 */
export function inferDirection(
  localPort: string,
  peerPort: string,
  state: string
): ConnDirection {
  const st = state.toUpperCase();
  if (st === "LISTEN" || st === "LISTENING") return "inbound";
  const lp = portNum(localPort);
  const pp = portNum(peerPort);
  const localWell = isWellKnownPort(lp);
  const peerWell = isWellKnownPort(pp);
  if (peerWell && !localWell) return "outbound";
  if (localWell && !peerWell) return "inbound";
  if (pp > 0 && pp < 1024 && lp >= 1024) return "outbound";
  if (lp > 0 && lp < 1024 && pp >= 1024) return "inbound";
  return "peer";
}

// ---- Reverse DNS (cached, best-effort) ------------------------------------

const hostCache = new Map<string, string | null>();
const hostInFlight = new Map<string, Promise<string | null>>();
const HOST_TTL_FAIL_MS = 15 * 60 * 1000;
const hostFailedAt = new Map<string, number>();

export async function resolveHostnames(
  ips: string[],
  limit = 40
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(ips.filter(Boolean))];
  const need: string[] = [];
  const now = Date.now();

  for (const ip of unique) {
    if (hostCache.has(ip)) {
      out.set(ip, hostCache.get(ip) ?? null);
      continue;
    }
    const fail = hostFailedAt.get(ip);
    if (fail && now - fail < HOST_TTL_FAIL_MS) {
      out.set(ip, null);
      continue;
    }
    need.push(ip);
    if (need.length >= limit) break;
  }

  await Promise.all(
    need.map(async (ip) => {
      let p = hostInFlight.get(ip);
      if (!p) {
        p = dns
          .reverse(ip)
          .then((names) => {
            const name = names[0] ?? null;
            hostCache.set(ip, name);
            hostFailedAt.delete(ip);
            return name;
          })
          .catch(() => {
            hostFailedAt.set(ip, Date.now());
            hostCache.set(ip, null);
            return null;
          })
          .finally(() => hostInFlight.delete(ip));
        hostInFlight.set(ip, p);
      }
      out.set(ip, await p);
    })
  );

  return out;
}

// ---- Per-connection TCP byte counters (best-effort) -----------------------

export interface TcpByteStats {
  bytesIn: number;
  bytesOut: number;
}

/** Key: `${localAddress}|${localPort}|${peerAddress}|${peerPort}` */
export type TcpByteMap = Map<string, TcpByteStats>;

export function tcpByteKey(
  localAddress: string,
  localPort: string,
  peerAddress: string,
  peerPort: string
): string {
  return `${localAddress}|${localPort}|${peerAddress}|${peerPort}`;
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch {
      resolve("");
      return;
    }
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  });
}

/**
 * Linux: `ss -H -tin` exposes bytes_received / bytes_acked for TCP sockets.
 */
async function linuxTcpBytes(): Promise<TcpByteMap> {
  const out = new Map<string, TcpByteStats>();
  const text = await run("ss", ["-H", "-tin"]);
  if (!text) return out;

  // ss -tin prints a header-ish line then "Recv-Q Send-Q Local Address:Port Peer Address:Port"
  // followed by a tab-indented info line containing bytes_received:N bytes_acked:N
  const lines = text.split(/\r?\n/);
  let pendingKey: string | null = null;
  for (const line of lines) {
    if (!line) continue;
    if (/^\s/.test(line) && pendingKey) {
      const recv = /bytes_received:(\d+)/.exec(line);
      const acked = /bytes_acked:(\d+)/.exec(line);
      if (recv || acked) {
        out.set(pendingKey, {
          bytesIn: recv ? Number(recv[1]) : 0,
          bytesOut: acked ? Number(acked[1]) : 0,
        });
      }
      pendingKey = null;
      continue;
    }
    // tcp   0   0   1.2.3.4:443   5.6.7.8:54321
    const m =
      /^\s*\S+\s+\d+\s+\d+\s+(\S+):(\d+)\s+(\S+):(\d+)/.exec(line) ||
      /^\s*(\S+):(\d+)\s+(\S+):(\d+)/.exec(line);
    if (m) {
      pendingKey = tcpByteKey(m[1], m[2], m[3], m[4]);
    } else {
      pendingKey = null;
    }
  }
  return out;
}

/**
 * Collect per-TCP byte totals when the OS exposes them. Returns empty on
 * platforms/permissions where counters are unavailable (typical unelevated Windows).
 */
export async function collectTcpBytes(): Promise<TcpByteMap> {
  if (process.platform === "linux") {
    try {
      return await linuxTcpBytes();
    } catch {
      return new Map();
    }
  }
  // Windows ESTATS requires elevation for SetPerTcpConnectionEStats; skip rather
  // than surface uninitialized garbage when access is denied.
  return new Map();
}

/** Derive per-second rates from two absolute counter snapshots. */
export function deriveByteRates(
  prev: TcpByteMap | null,
  next: TcpByteMap,
  dtSec: number
): Map<string, { rxSec: number; txSec: number }> {
  const rates = new Map<string, { rxSec: number; txSec: number }>();
  if (!prev || dtSec <= 0) return rates;
  for (const [key, cur] of next) {
    const p = prev.get(key);
    if (!p) continue;
    rates.set(key, {
      rxSec: Math.max(0, (cur.bytesIn - p.bytesIn) / dtSec),
      txSec: Math.max(0, (cur.bytesOut - p.bytesOut) / dtSec),
    });
  }
  return rates;
}
