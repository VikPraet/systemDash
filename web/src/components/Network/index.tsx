import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Network as NetworkIcon, X } from "lucide-react";
import { fetchNetwork, fetchNetworkOrigin, formatBytes } from "../../api";
import { cache } from "../../cache";
import type {
  GeoLocation,
  NetworkConnection,
  NetworkInterfaceStat,
  NetworkSnapshot,
} from "../../types";
import { ProcessIcon } from "../ProcessIcon";
import {
  GhostBtn,
  ModalActions,
  ModalCard,
  ModalClose,
  ModalHead,
  ModalOverlay,
  ModalSub,
  RevokeDetails,
} from "../ui/styles";
import {
  TrafficMap,
  aggregateDestinations,
  destinationKey,
  isHostFilter,
} from "./TrafficMap";
import { UsageTimeline } from "./UsageTimeline";
import { MAP_HEIGHT, MAP_WIDTH, WORLD_LAND_PATH, project } from "./worldPath";
import * as S from "./styles";

const POLL_MS = 2000;

type SortKey = "process" | "service" | "remote" | "traffic" | "state";

function flagEmoji(cc: string | null): string {
  if (!cc || !/^[a-z]{2}$/i.test(cc)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    ...[...cc.toUpperCase()].map((c) => base + (c.codePointAt(0) ?? 65) - 65)
  );
}

function LocationLine({
  location,
  hideUnknown = false,
}: Readonly<{
  location: GeoLocation | null;
  hideUnknown?: boolean;
}>) {
  if (!location) return <span className="muted">—</span>;
  if (location.status === "local") {
    return (
      <S.LocLine>
        <NetworkIcon size={12} strokeWidth={1.8} />
        <S.LocText>{location.label}</S.LocText>
      </S.LocLine>
    );
  }
  if (location.status === "unknown") {
    if (hideUnknown) return <span className="muted">—</span>;
    return (
      <S.LocLine>
        <MapPin size={12} strokeWidth={1.8} />
        <S.LocText>Unknown location</S.LocText>
      </S.LocLine>
    );
  }
  const flag = flagEmoji(location.countryCode);
  const title = [location.city, location.region, location.country]
    .filter(Boolean)
    .join(", ");
  return (
    <S.LocLine title={title || location.label}>
      {flag ? (
        <S.LocFlag aria-hidden>{flag}</S.LocFlag>
      ) : (
        <MapPin size={12} strokeWidth={1.8} />
      )}
      <S.LocText>{location.label}</S.LocText>
    </S.LocLine>
  );
}

function formatEndpoint(address: string, port: string): string {
  if (!address || address === "0.0.0.0" || address === "::") {
    if (!port || port === "0") return "—";
    return `*:${port}`;
  }
  if (!port || port === "0") return address;
  const needsBrackets = address.includes(":") && !address.startsWith("[");
  return needsBrackets ? `[${address}]:${port}` : `${address}:${port}`;
}

function formatRate(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec)) return "—";
  return `${formatBytes(Math.round(bytesPerSec))}/s`;
}

function connTraffic(c: NetworkConnection): number {
  return (c.rxSec ?? 0) + (c.txSec ?? 0) || (c.bytesIn ?? 0) + (c.bytesOut ?? 0);
}

function connKey(c: NetworkConnection): string {
  return `${c.protocol}|${c.localAddress}|${c.localPort}|${c.peerAddress}|${c.peerPort}|${c.pid}|${c.state}`;
}

function sortValue(c: NetworkConnection, key: SortKey): string | number {
  switch (key) {
    case "process":
      return c.process.toLowerCase();
    case "service":
      return c.service.toLowerCase();
    case "remote":
      return (c.peerHost || c.peerAddress).toLowerCase();
    case "traffic":
      return connTraffic(c);
    case "state":
      return c.state;
  }
}

function directionLabel(d: NetworkConnection["direction"]): string {
  if (d === "outbound") return "Out";
  if (d === "inbound") return "In";
  return "Peer";
}

function topRemoteProcess(connections: NetworkConnection[]): {
  name: string;
  pid: number;
  count: number;
} | null {
  const byPid = new Map<number, { name: string; count: number }>();
  for (const c of connections) {
    if (c.kind !== "remote" || c.pid <= 0) continue;
    const cur = byPid.get(c.pid);
    if (cur) cur.count += 1;
    else byPid.set(c.pid, { name: c.process, count: 1 });
  }
  let best: { name: string; pid: number; count: number } | null = null;
  for (const [pid, v] of byPid) {
    if (!best || v.count > best.count) {
      best = { pid, name: v.name, count: v.count };
    }
  }
  return best;
}

export function Network() {
  const [data, setData] = useState<NetworkSnapshot | null>(() => cache.network);
  const [originPreview, setOriginPreview] = useState<GeoLocation | null>(
    () => cache.network?.origin ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("traffic");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [mapFilter, setMapFilter] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function tick() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetchNetwork(ctrl.signal);
        if (!cancelled) {
          cache.network = res;
          setData(res);
          if (res.origin) setOriginPreview(res.origin);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        inFlight.current = false;
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(id);
    };
  }, []);

  // Resolve host location early so the loading map can pulse the real origin.
  useEffect(() => {
    if (data?.origin || originPreview) return;
    let cancelled = false;
    const ctrl = new AbortController();
    fetchNetworkOrigin(ctrl.signal)
      .then((origin) => {
        if (!cancelled && origin) setOriginPreview(origin);
      })
      .catch(() => {
        /* full /api/network will retry */
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [data?.origin, originPreview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedKey) setSelectedKey(null);
      else if (mapFilter) setMapFilter(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKey, mapFilter]);

  const panelOpen = mapFilter != null;

  const selectedDest = useMemo(() => {
    if (!mapFilter || !data || isHostFilter(mapFilter)) return null;
    return (
      aggregateDestinations(data.connections).find((d) => d.key === mapFilter) ??
      null
    );
  }, [mapFilter, data]);

  const rows = useMemo(() => {
    if (!data || !mapFilter) return [];
    const q = query.trim().toLowerCase();
    let list = data.connections.filter((c) => c.kind === "remote");
    if (!isHostFilter(mapFilter)) {
      list = list.filter((c) => destinationKey(c) === mapFilter);
    }
    if (q) {
      list = list.filter((c) => {
        const hay = [
          c.process,
          String(c.pid),
          c.protocol,
          c.localAddress,
          c.localPort,
          c.peerAddress,
          c.peerPort,
          c.state,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data, query, sortKey, sortDir, mapFilter]);

  const selected = useMemo(() => {
    if (!selectedKey || !data) return null;
    return data.connections.find((c) => connKey(c) === selectedKey) ?? null;
  }, [selectedKey, data]);

  const peerSiblings = useMemo(() => {
    if (!selected || !data) return 0;
    return data.connections.filter(
      (c) =>
        c.peerAddress === selected.peerAddress && connKey(c) !== connKey(selected)
    ).length;
  }, [selected, data]);

  const bandwidth = useMemo(() => {
    if (!data) return { rx: null as number | null, tx: null as number | null };
    let rx = 0;
    let tx = 0;
    let any = false;
    for (const iface of data.interfaces) {
      if (iface.rxSec != null) {
        rx += iface.rxSec;
        any = true;
      }
      if (iface.txSec != null) {
        tx += iface.txSec;
        any = true;
      }
    }
    return any ? { rx, tx } : { rx: null, tx: null };
  }, [data]);

  const topProcess = useMemo(
    () => (data ? topRemoteProcess(data.connections) : null),
    [data]
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "traffic" ? "desc" : "asc");
    }
  }

  function closePanel() {
    setMapFilter(null);
    setSelectedKey(null);
    setQuery("");
  }

  if (!data) {
    const origin = originPreview;
    const originPt =
      origin?.lat != null &&
      origin?.lon != null &&
      Number.isFinite(origin.lat) &&
      Number.isFinite(origin.lon)
        ? project(origin.lon, origin.lat)
        : null;

    return (
      <S.MapLoading role="status" aria-live="polite" aria-busy={!error}>
        <svg
          className="load-svg"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <rect
            className="load-ocean"
            x={0}
            y={0}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
          />
          <path className="load-land" d={WORLD_LAND_PATH} />
          {originPt && (
            <g transform={`translate(${originPt.x} ${originPt.y})`}>
              <g className="load-origin-pulse-wrap">
                <circle className="load-origin-pulse" r={4} />
              </g>
              <circle className="load-origin-dot" r={3} />
            </g>
          )}
        </svg>
        <div className="load-card" aria-hidden>
          <div className="load-bone mid" />
          <div className="load-bone tall" />
          <div className="load-bone wide" />
        </div>
        <div className="load-caption">
          {error
            ? `Could not load network: ${error}`
            : origin?.label
              ? `Mapping from ${origin.label}…`
              : "Mapping connections…"}
        </div>
      </S.MapLoading>
    );
  }

  const { summary, interfaces, origin } = data;

  return (
    <S.NetRoot>
      <TrafficMap
        origin={origin ?? null}
        connections={data.connections}
        selectedKey={mapFilter}
        onSelect={setMapFilter}
      />

      <S.StatsOverlay>
        <S.StatBlock>
          <span className="stat-label">Bandwidth</span>
          <span className="stat-value">
            <span className="stat-rx">↓ {formatRate(bandwidth.rx)}</span>
            {"  "}
            <span className="stat-tx">↑ {formatRate(bandwidth.tx)}</span>
          </span>
          <span className="stat-sub">
            {summary.remote} remote · {origin?.label ?? "location unknown"}
          </span>
        </S.StatBlock>
        <S.StatsDivider />
        <S.StatBlock>
          <span className="stat-label">Top process</span>
          {topProcess ? (
            <>
              <div className="stat-process">
                <ProcessIcon name={topProcess.name} hasWindow={false} />
                <span className="stat-process-name" title={topProcess.name}>
                  {topProcess.name}
                </span>
              </div>
              <span className="stat-sub">
                {topProcess.count} remote connection
                {topProcess.count === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <span className="stat-sub">No remote sockets</span>
          )}
        </S.StatBlock>
      </S.StatsOverlay>

      <UsageTimeline />

      <S.SidePanel $open={panelOpen} aria-hidden={!panelOpen}>
        <S.PanelHead>
          <S.PanelHeadText>
            <h3 className="panel-title">Connections</h3>
            <span className="panel-sub">
              {isHostFilter(mapFilter)
                ? `${origin?.label ?? "This host"} · all remote`
                : `${selectedDest?.label ?? "Selected destination"}`}{" "}
              · {rows.length}
            </span>
          </S.PanelHeadText>
          <S.PanelClose type="button" onClick={closePanel} aria-label="Close">
            <X size={16} strokeWidth={1.8} />
          </S.PanelClose>
        </S.PanelHead>

        <S.PanelBody>
          <S.NetToolbar>
            <S.NetSearch
              type="text"
              placeholder="Filter process, IP, port…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </S.NetToolbar>

          <S.NetTableWrap>
            <S.NetTable>
              <thead>
                <tr>
                  <Th
                    label="Process"
                    col="process"
                    {...{ sortKey, sortDir, toggleSort }}
                  />
                  <Th
                    label="Service"
                    col="service"
                    {...{ sortKey, sortDir, toggleSort }}
                  />
                  <Th
                    label="Remote"
                    col="remote"
                    {...{ sortKey, sortDir, toggleSort }}
                  />
                  <Th
                    label="Traffic"
                    col="traffic"
                    {...{ sortKey, sortDir, toggleSort }}
                  />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const key = connKey(c);
                  return (
                    <Row
                      key={key}
                      c={c}
                      bytesAvailable={data.bytesAvailable}
                      selected={selectedKey === key}
                      onSelect={() =>
                        setSelectedKey((cur) => (cur === key ? null : key))
                      }
                    />
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted net-empty">
                      No matching connections.
                    </td>
                  </tr>
                )}
              </tbody>
            </S.NetTable>
          </S.NetTableWrap>
        </S.PanelBody>
      </S.SidePanel>

      {selected && (
        <ConnectionDetail
          c={selected}
          peerSiblings={peerSiblings}
          interfaces={interfaces}
          bytesAvailable={data.bytesAvailable}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </S.NetRoot>
  );
}

function Th({
  label,
  col,
  sortKey,
  sortDir,
  toggleSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (key: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className={active ? "sorted" : ""} onClick={() => toggleSort(col)}>
      {label}
      {active && (
        <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>
      )}
    </th>
  );
}

function Row({
  c,
  bytesAvailable,
  selected,
  onSelect,
}: {
  c: NetworkConnection;
  bytesAvailable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const remote = formatEndpoint(c.peerAddress, c.peerPort);
  const flag = flagEmoji(c.location?.countryCode ?? null);
  return (
    <tr
      className={`net-row net-row-${c.direction}${selected ? " selected" : ""}`}
      onClick={onSelect}
    >
      <td className="net-process" title={`${c.process} (pid ${c.pid})`}>
        <span className="net-process-cell">
          <ProcessIcon name={c.process} hasWindow={false} />
          <span className="net-process-text">{c.process}</span>
        </span>
      </td>
      <td>
        <S.ServiceTag>{c.service}</S.ServiceTag>
        <div>
          <S.DirTag $dir={c.direction}>{directionLabel(c.direction)}</S.DirTag>
        </div>
      </td>
      <td className="net-addr" title={remote}>
        {c.peerHost ? (
          <>
            <S.PeerHost title={c.peerHost}>
              {flag ? `${flag} ` : ""}
              {c.peerHost}
            </S.PeerHost>
            <span className="muted" style={{ fontSize: 10 }}>
              {remote}
            </span>
          </>
        ) : (
          <>
            {flag ? <span aria-hidden>{flag} </span> : null}
            {remote}
          </>
        )}
      </td>
      <td>
        <S.TrafficCell>
          {bytesAvailable && (c.rxSec != null || c.txSec != null) ? (
            <>
              <span className="rx">↓ {formatRate(c.rxSec)}</span>
              <span className="tx">↑ {formatRate(c.txSec)}</span>
            </>
          ) : bytesAvailable && (c.bytesIn != null || c.bytesOut != null) ? (
            <>
              <span className="rx">↓ {formatBytes(c.bytesIn ?? 0)}</span>
              <span className="tx">↑ {formatBytes(c.bytesOut ?? 0)}</span>
            </>
          ) : (
            <S.DirTag $dir={c.direction}>
              {c.direction === "outbound"
                ? "Sending"
                : c.direction === "inbound"
                  ? "Receiving"
                  : "Peer"}
            </S.DirTag>
          )}
        </S.TrafficCell>
      </td>
    </tr>
  );
}

function ConnectionDetail({
  c,
  peerSiblings,
  interfaces,
  bytesAvailable,
  onClose,
}: {
  c: NetworkConnection;
  peerSiblings: number;
  interfaces: NetworkInterfaceStat[];
  bytesAvailable: boolean;
  onClose: () => void;
}) {
  const local = formatEndpoint(c.localAddress, c.localPort);
  const remote = formatEndpoint(c.peerAddress, c.peerPort);
  const primaryIfaces = interfaces.slice(0, 3);

  return (
    <ModalOverlay onClick={onClose} role="presentation">
      <ModalCard onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <ModalHead>
          <h3>Connection</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.8} />
          </ModalClose>
        </ModalHead>

        <ModalSub>
          {c.direction === "outbound"
            ? `Outbound ${c.service} — this process is dialing the remote peer.`
            : c.direction === "inbound"
              ? `Inbound ${c.service} — the remote peer dialed a local port.`
              : `${c.service} peer connection.`}
        </ModalSub>

        <RevokeDetails>
          <div>
            <dt>Process</dt>
            <S.DetailProcess>
              <ProcessIcon name={c.process} hasWindow={false} />
              {c.process}
            </S.DetailProcess>
          </div>
          <div>
            <dt>PID</dt>
            <dd className="mono">{c.pid || "—"}</dd>
          </div>
          <div>
            <dt>Service</dt>
            <dd>
              <S.ServiceTag>{c.service}</S.ServiceTag>{" "}
              <S.DirTag $dir={c.direction}>{directionLabel(c.direction)}</S.DirTag>
            </dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd className="mono">{local}</dd>
          </div>
          <div>
            <dt>Remote</dt>
            <dd className="mono">{remote}</dd>
          </div>
          {c.peerHost && (
            <div>
              <dt>Hostname</dt>
              <dd>{c.peerHost}</dd>
            </div>
          )}
          <div>
            <dt>State</dt>
            <dd>{c.state}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              <LocationLine location={c.location} />
            </dd>
          </div>
          {bytesAvailable && (
            <>
              <div>
                <dt>Received</dt>
                <dd className="mono">
                  {c.rxSec != null
                    ? `${formatRate(c.rxSec)} (${formatBytes(c.bytesIn ?? 0)} total)`
                    : formatBytes(c.bytesIn ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Sent</dt>
                <dd className="mono">
                  {c.txSec != null
                    ? `${formatRate(c.txSec)} (${formatBytes(c.bytesOut ?? 0)} total)`
                    : formatBytes(c.bytesOut ?? 0)}
                </dd>
              </div>
            </>
          )}
          {peerSiblings > 0 && (
            <div>
              <dt>Same peer</dt>
              <dd>
                {peerSiblings} other socket{peerSiblings === 1 ? "" : "s"}
              </dd>
            </div>
          )}
        </RevokeDetails>

        {!bytesAvailable && (
          <S.DetailNote>
            Per-connection byte counters aren&apos;t available on this host
            (Windows needs an elevated Beacon; Linux uses{" "}
            <span className="mono">ss</span>). Direction and service are inferred
            from ports.
          </S.DetailNote>
        )}

        {primaryIfaces.length > 0 && (
          <S.DetailNote>
            Host NIC rates (all sockets):{" "}
            {primaryIfaces.map((i, idx) => (
              <span key={i.iface}>
                {idx > 0 ? " · " : null}
                {i.iface}:{" "}
                <span className="rx">↓ {formatRate(i.rxSec)}</span>
                {" · "}
                <span className="tx">↑ {formatRate(i.txSec)}</span>
              </span>
            ))}
          </S.DetailNote>
        )}

        <ModalActions>
          <GhostBtn type="button" onClick={onClose}>
            Close
          </GhostBtn>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>
  );
}
