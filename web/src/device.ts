// Lightweight User-Agent parsing for the sessions list. We intentionally avoid a
// runtime dependency (ua-parser-js etc.) because we only need a coarse summary:
// what kind of device, which browser, and which OS signed in. The raw string is
// always kept around so the full value can be shown on hover.

export type DeviceKind = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

export interface DeviceInfo {
  kind: DeviceKind;
  browser: string | null;
  os: string | null;
  // Short human label, e.g. "Chrome on Windows" or "Safari on iPhone".
  label: string;
  raw: string | null;
}

function detectOs(ua: string): string | null {
  if (/windows nt 10\.0/i.test(ua)) return "Windows";
  if (/windows nt/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) {
    const m = /android[ /]?([\d.]+)/i.exec(ua);
    return m ? `Android ${m[1]}` : "Android";
  }
  if (/(iphone|ipad|ipod)/i.test(ua)) {
    const m = /os ([\d_]+)/i.exec(ua);
    return m ? `iOS ${m[1].replaceAll("_", ".")}` : "iOS";
  }
  if (/mac os x|macintosh/i.test(ua)) {
    const m = /mac os x ([\d_]+)/i.exec(ua);
    return m ? `macOS ${m[1].replaceAll("_", ".")}` : "macOS";
  }
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux/i.test(ua)) return "Linux";
  return null;
}

function detectBrowser(ua: string): string | null {
  // Order matters: many browsers spoof "Chrome"/"Safari" in their UA, so we
  // check the more specific tokens first.
  if (/edg(?:a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/crios/i.test(ua)) return "Chrome";
  if (/chrome|chromium/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua) && /version\//i.test(ua)) return "Safari";
  if (/curl|wget|python-requests|node-fetch|axios|go-http-client|postmanruntime/i.test(ua))
    return "API client";
  return null;
}

function detectKind(ua: string): DeviceKind {
  if (/bot|crawler|spider|crawling|curl|wget|python-requests|node-fetch|go-http-client|postmanruntime/i.test(ua))
    return "bot";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua?.trim()) {
    return { kind: "unknown", browser: null, os: null, label: "Unknown device", raw: ua ?? null };
  }
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  const kind = detectKind(ua);

  let label: string;
  if (browser && os) label = `${browser} on ${os.replace(/ [\d.]+$/, "")}`;
  else if (browser) label = browser;
  else if (os) label = os.replace(/ [\d.]+$/, "");
  else label = "Unknown device";

  return { kind, browser, os, label, raw: ua };
}
