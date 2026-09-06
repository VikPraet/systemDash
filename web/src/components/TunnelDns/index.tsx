import { useState } from "react";
import { Check, Copy } from "lucide-react";
import * as S from "./styles";

export function TunnelDnsHint({
  target,
  hostname,
  dnsMessage,
}: {
  target?: string | null;
  hostname?: string | null;
  dnsMessage?: string | null;
}) {
  const autoOk = !!dnsMessage && /^DNS CNAME created/i.test(dnsMessage);
  if (autoOk) {
    return (
      <S.Box $ok>
        Cloudflare DNS is already set for this hostname. Wait a minute, then
        open https://{hostname || "your-host"}.
      </S.Box>
    );
  }
  if (!target) return null;
  const host = hostname?.trim() || "your-subdomain";
  return (
    <S.Box>
      <S.Title>Cloudflare DNS</S.Title>
      <S.Text>
        If the site isn’t reachable after Save, add this record in Cloudflare →
        DNS (same zone as your other sites). Proxied (orange cloud).
      </S.Text>
      <CopyRow label="Type" value="CNAME" />
      <CopyRow label="Name" value={host} />
      <CopyRow label="Target" value={target} />
      {dnsMessage && !autoOk && <S.Text>{dnsMessage}</S.Text>}
    </S.Box>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <S.Row>
      <S.Label>{label}</S.Label>
      <S.Value title={value}>{value}</S.Value>
      <S.CopyBtn type="button" onClick={() => void copy()} title={`Copy ${label}`}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </S.CopyBtn>
    </S.Row>
  );
}
