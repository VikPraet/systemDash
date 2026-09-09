import type { IncomingMessage } from "node:http";

/** Loopback peers (Cloudflare Tunnel / local reverse proxies). */
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export interface AddressReq {
  headers: IncomingMessage["headers"];
  socket?: { remoteAddress?: string; encrypted?: boolean };
  ip?: string;
  secure?: boolean;
}

function header(req: AddressReq, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return undefined;
}

/** Strips IPv6-mapped IPv4 and zone ids. */
export function normalizeIp(addr: string | undefined | null): string {
  if (!addr) return "";
  let ip = addr.trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);
  return ip;
}

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map((p) => Number(p));
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [net, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const ipN = ipv4ToInt(ip);
  const netN = ipv4ToInt(net ?? "");
  if (ipN == null || netN == null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipN & mask) === (netN & mask);
}

function extraTrusted(): string[] {
  const raw = process.env.SYSTEMDASH_TRUSTED_PROXIES ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when the immediate TCP peer is a configured reverse proxy. */
export function isTrustedProxyIp(ip: string): boolean {
  const n = normalizeIp(ip);
  if (!n) return false;
  if (LOOPBACK.has(n) || LOOPBACK.has(ip.trim())) return true;
  for (const entry of extraTrusted()) {
    const e = normalizeIp(entry.includes("/") ? entry.slice(0, entry.indexOf("/")) : entry);
    if (entry.includes("/")) {
      if (ipv4InCidr(n, entry)) return true;
      continue;
    }
    if (n === e || n === normalizeIp(entry)) return true;
  }
  return false;
}

export function peerAddress(req: AddressReq): string {
  return normalizeIp(req.socket?.remoteAddress) || "";
}

export function isTrustedProxyPeer(req: AddressReq): boolean {
  return isTrustedProxyIp(peerAddress(req) || req.ip || "");
}

/**
 * Client IP for audit logs and rate limits. Forwarded headers are used only
 * when the immediate peer is a trusted proxy.
 */
export function clientIp(req: AddressReq): string {
  const peer = peerAddress(req);
  if (isTrustedProxyIp(peer)) {
    const fwd = header(req, "x-forwarded-for");
    if (fwd) {
      const first = normalizeIp(fwd.split(",")[0]);
      if (first) return first;
    }
  }
  return peer;
}

/** Cookie Secure flag: TLS on the socket, or https proto from a trusted proxy. */
export function isSecureRequest(req: AddressReq): boolean {
  if (req.socket?.encrypted) return true;
  const peer = peerAddress(req);
  if (isTrustedProxyIp(peer)) {
    const proto = header(req, "x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
    if (req.secure) return true;
  }
  return false;
}

/** Express `trust proxy` callback: only configured peers. */
export function trustProxyAddress(address: string): boolean {
  return isTrustedProxyIp(address);
}
