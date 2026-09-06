import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Globe, RefreshCw } from "lucide-react";
import { fetchPublicAccess, setPublicAccessHostname } from "../../api";
import type { IngressRoute, PublicAccessStatus } from "../../types";
import { AuthError, GhostBtn, Loading } from "../ui/styles";
import { Tooltip } from "../ui/Tooltip";
import { TunnelDnsHint } from "../TunnelDns";
import * as S from "./styles";

function serviceHint(service: string): string {
  return service.replace(/^https?:\/\//i, "");
}

function statusCopy(data: PublicAccessStatus): {
  label: string;
  state: "good" | "warn" | "bad" | undefined;
} {
  if (data.self) return { label: "Online", state: "good" };
  if (data.rememberedHostname && data.mode === "dashboard") {
    return { label: "Hostname saved — add it in Cloudflare", state: "warn" };
  }
  if (data.mode === "local-config" && data.ingress.running) {
    return { label: "Tunnel ready — not exposed yet", state: "warn" };
  }
  if (data.mode === "dashboard") {
    return { label: "Dashboard-managed tunnel", state: "warn" };
  }
  if (data.mode === "running-unread") {
    return { label: "Tunnel running — config not readable", state: "warn" };
  }
  if (data.ingress.running) return { label: "Tunnel running", state: "warn" };
  return { label: "LAN only", state: "bad" };
}

function hintFor(data: PublicAccessStatus): string {
  if (data.canWrite) {
    return "Type a hostname on a domain you already use with this tunnel, then expose. SystemDash writes the tunnel route. DNS is the CNAME box below if it isn’t live yet.";
  }
  if (data.mode === "dashboard") {
    return `In Cloudflare Zero Trust, add a public hostname pointing at ${data.origin}. Then save that name here.`;
  }
  return (
    data.ingress.note ??
    `This dashboard listens on ${data.origin}. Other sites on this machine already use cloudflared — this hooks the same tunnel.`
  );
}

function dnsNeedsPaste(data: PublicAccessStatus): boolean {
  const dns = data.result?.dns;
  if (!dns) return false;
  return !/^DNS CNAME created/i.test(dns);
}

export function PublicAccess() {
  const [data, setData] = useState<PublicAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hostname, setHostname] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const reload = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPublicAccess({ refresh });
      setData(next);
      setHostname((prev) =>
        prev.trim()
          ? prev
          : (next.self?.hostname ?? next.rememberedHostname ?? "")
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(true);
  }, [reload]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hostname.trim()) return;
    const already =
      !!data?.self &&
      data.self.hostname.toLowerCase() === hostname.trim().toLowerCase();
    if (data?.canWrite && !already && !ack) {
      setError("Confirm you understand this exposes the control panel.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await setPublicAccessHostname(hostname.trim());
      setData(next);
      setNotice(next.notice ?? null);
      if (next.self?.hostname) setHostname(next.self.hostname);
      if (next.self && !dnsNeedsPaste(next)) setExpanded(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pickRoute(route: IngressRoute) {
    setHostname(route.hostname);
  }

  if (loading && !data) {
    return (
      <S.Root>
        <S.Head>
          <h3>Public access</h3>
        </S.Head>
        <Loading>Checking cloudflared…</Loading>
      </S.Root>
    );
  }

  if (!data) {
    return (
      <S.Root>
        <S.Head>
          <h3>Public access</h3>
        </S.Head>
        <S.Hint>{error ?? "Could not read tunnel status."}</S.Hint>
      </S.Root>
    );
  }

  const live = !!data.self;
  const status = statusCopy(data);
  const publicUrl =
    data.self?.url ??
    (data.rememberedHostname ? `https://${data.rememberedHostname}` : null);
  const compact = live && !expanded;

  if (compact && publicUrl) {
    return (
      <S.Root>
        <S.LiveRow>
          <div>
            <h3>Public access</h3>
            <S.LiveMeta>
              <S.StatusLabel $state="good">
                <Globe size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                Online
              </S.StatusLabel>
              <S.PublicLink href={publicUrl} target="_blank" rel="noreferrer">
                {publicUrl.replace(/^https:\/\//, "")}
                <ExternalLink size={12} />
              </S.PublicLink>
            </S.LiveMeta>
          </div>
          <S.TextBtn type="button" onClick={() => setExpanded(true)}>
            Change
          </S.TextBtn>
        </S.LiveRow>
      </S.Root>
    );
  }

  const sources = data.ingress.sources;
  const retarget =
    data.ingress.routes.find(
      (r) => r.hostname.toLowerCase() === hostname.trim().toLowerCase()
    ) ?? null;
  const willRetarget = !!(
    retarget &&
    retarget.port !== data.port &&
    data.canWrite
  );
  const alreadyLive =
    !!data.self &&
    data.self.hostname.toLowerCase() === hostname.trim().toLowerCase();
  const showDns = !live || dnsNeedsPaste(data);

  return (
    <S.Root>
      <S.Head>
        <h3>Public access</h3>
        <S.LiveMeta>
          {live && (
            <S.TextBtn type="button" onClick={() => setExpanded(false)}>
              Done
            </S.TextBtn>
          )}
          <Tooltip label="Re-read local cloudflared config">
            <GhostBtn type="button" onClick={() => void reload(true)} disabled={loading || busy}>
              <RefreshCw size={14} />
              Refresh
            </GhostBtn>
          </Tooltip>
        </S.LiveMeta>
      </S.Head>

      <S.StatusRow>
        <S.StatusLabel $state={status.state}>
          <Globe size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          {status.label}
        </S.StatusLabel>
        {publicUrl && (
          <S.PublicLink href={publicUrl} target="_blank" rel="noreferrer">
            {publicUrl.replace(/^https:\/\//, "")}
            <ExternalLink size={12} />
          </S.PublicLink>
        )}
      </S.StatusRow>

      <S.Hint>{hintFor(data)}</S.Hint>
      {sources.length > 0 && (
        <S.Hint>
          Config: {sources.join(", ")} · this process {data.origin}
        </S.Hint>
      )}

      {data.conflict && (
        <S.Warn>
          {data.conflict.hostname} currently goes to {serviceHint(data.conflict.service)},
          not this dashboard. Saving will retarget it to {data.origin}.
        </S.Warn>
      )}
      {willRetarget && !data.conflict && (
        <S.Warn>
          {retarget!.hostname} currently goes to {serviceHint(retarget!.service)}.
          Exposing this dashboard will point it at {data.origin} instead.
        </S.Warn>
      )}

      {data.canWrite && !live && (
        <S.Warn>
          This is the host control panel (files, terminal, power). Prefer a
          hostname behind Cloudflare Access, not a guessable public URL.
        </S.Warn>
      )}

      {notice && <S.Notice>{notice}</S.Notice>}
      {error && <AuthError $inline>{error}</AuthError>}

      {showDns && (
        <TunnelDnsHint
          target={data.ingress.dnsTarget}
          hostname={hostname.trim() || data.self?.hostname || data.rememberedHostname}
          dnsMessage={data.result?.dns}
        />
      )}

      <S.Form onSubmit={onSubmit}>
        <S.Field>
          Public hostname
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="dash.example.com"
            autoComplete="off"
            spellCheck={false}
          />
        </S.Field>
        <GhostBtn type="submit" disabled={busy || !hostname.trim()}>
          {data.canWrite
            ? data.self
              ? "Update tunnel"
              : "Expose on tunnel"
            : data.mode === "dashboard"
              ? "Save hostname"
              : "Save"}
        </GhostBtn>
      </S.Form>

      {data.canWrite && !alreadyLive && (
        <S.CheckRow>
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          I understand that a public URL lets anyone who can log in control this
          machine.
        </S.CheckRow>
      )}

      {data.ingress.routes.length > 0 && (
        <>
          <S.Hint>Hostnames already on this tunnel — click to fill.</S.Hint>
          <S.HostList>
            {data.ingress.routes.map((r) => (
              <S.HostRow
                key={r.url}
                type="button"
                $active={
                  r.hostname.toLowerCase() ===
                  (data.self?.hostname ?? hostname).toLowerCase()
                }
                onClick={() => pickRoute(r)}
              >
                {r.hostname}
                <span>
                  {serviceHint(r.service)}
                  {r.port === data.port ? " · this dashboard" : ""}
                </span>
              </S.HostRow>
            ))}
          </S.HostList>
        </>
      )}
    </S.Root>
  );
}
