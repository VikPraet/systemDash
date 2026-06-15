import { useEffect, useMemo, useState } from "react";
import {
  downloadUrl,
  fetchDirSize,
  fetchListing,
  fetchRoots,
  formatBytes,
  formatDate,
} from "../api";
import type { DirListing, FsEntry, FsRoot } from "../types";
import { Bar } from "./widgets";

// `null` path = the "This PC" overview that lists drives.
type Path = string | null;

// Folder sizes are computed lazily in the background after a listing loads.
type DirSize =
  | { state: "loading" }
  | { state: "done"; bytes: number; partial: boolean }
  | { state: "error" };

const SIZE_CONCURRENCY = 4;

export function Files() {
  const [roots, setRoots] = useState<FsRoot[]>([]);
  const [path, setPath] = useState<Path>(null);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [dirSizes, setDirSizes] = useState<Record<string, DirSize>>({});

  useEffect(() => {
    let cancelled = false;
    fetchRoots()
      .then((r) => !cancelled && setRoots(r))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (path === null) {
      setListing(null);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setQuery("");
    fetchListing(path, ctrl.signal)
      .then((l) => !cancelled && setListing(l))
      .catch((e) => {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [path]);

  // After a listing loads, compute folder sizes in the background (bounded
  // concurrency) and fill them in as each completes.
  useEffect(() => {
    if (!listing) {
      setDirSizes({});
      return;
    }
    const dirs = listing.entries.filter((e) => e.type === "dir");
    setDirSizes(
      Object.fromEntries(dirs.map((d) => [d.path, { state: "loading" }]))
    );
    if (dirs.length === 0) return;

    let cancelled = false;
    const ctrl = new AbortController();
    let next = 0;

    async function worker() {
      while (!cancelled && next < dirs.length) {
        const entry = dirs[next++];
        try {
          const r = await fetchDirSize(entry.path, ctrl.signal);
          if (!cancelled) {
            setDirSizes((prev) => ({
              ...prev,
              [entry.path]: { state: "done", bytes: r.bytes, partial: r.partial },
            }));
          }
        } catch (e) {
          if (!cancelled && (e as Error).name !== "AbortError") {
            setDirSizes((prev) => ({ ...prev, [entry.path]: { state: "error" } }));
          }
        }
      }
    }

    for (let i = 0; i < Math.min(SIZE_CONCURRENCY, dirs.length); i++) worker();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [listing]);

  const homePath = useMemo(
    () => roots.find((r) => r.kind === "home")?.path ?? null,
    [roots]
  );
  const drives = useMemo(
    () => roots.filter((r) => r.kind === "drive" || r.kind === "root"),
    [roots]
  );

  const crumbs = useMemo(
    () => (path && listing ? breadcrumbs(listing.path) : []),
    [path, listing]
  );

  const entries = useMemo(() => {
    if (!listing) return [];
    const q = query.trim().toLowerCase();
    return q
      ? listing.entries.filter((e) => e.name.toLowerCase().includes(q))
      : listing.entries;
  }, [listing, query]);

  function goUp() {
    if (listing?.parent) setPath(listing.parent);
    else setPath(null);
  }

  const atThisPc = path === null;

  return (
    <div className="files">
      <div className="files-toolbar">
        <div className="files-roots">
          <button className={atThisPc ? "active" : ""} onClick={() => setPath(null)}>
            <PcIcon />
            This PC
          </button>
          {homePath && (
            <button
              className={listing?.path === homePath ? "active" : ""}
              onClick={() => setPath(homePath)}
            >
              <HomeIcon />
              Home
            </button>
          )}
        </div>
        {!atThisPc && (
          <input
            className="proc-search files-search"
            type="text"
            placeholder="Filter in this folder…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>

      <div className="files-nav">
        <button
          className="files-up"
          disabled={atThisPc}
          onClick={goUp}
          title="Up one level"
        >
          ↑
        </button>
        <div className="crumbs">
          <span className="crumb">
            <button onClick={() => setPath(null)}>This PC</button>
          </span>
          {crumbs.map((c) => (
            <span key={c.path} className="crumb">
              <span className="crumb-sep">/</span>
              <button onClick={() => setPath(c.path)}>{c.label}</button>
            </span>
          ))}
        </div>
      </div>

      <div className="files-body">
        {atThisPc ? (
          <ThisPc drives={drives} onOpen={setPath} />
        ) : error ? (
          <div className="files-message bad">{error}</div>
        ) : loading && !listing ? (
          <div className="files-message muted">Loading…</div>
        ) : (
          <table className="proc-table files-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="ta-right">Size</th>
                <th className="ta-right">Modified</th>
                <th className="ta-right"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <FileRow
                  key={e.path}
                  e={e}
                  dirSize={e.type === "dir" ? dirSizes[e.path] : undefined}
                  onOpen={() => setPath(e.path)}
                />
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted proc-empty">
                    {listing && listing.entries.length > 0
                      ? "No matching items."
                      : "This folder is empty."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ThisPc({
  drives,
  onOpen,
}: {
  drives: FsRoot[];
  onOpen: (path: string) => void;
}) {
  if (drives.length === 0) {
    return <div className="files-message muted">Loading drives…</div>;
  }
  return (
    <div className="drives">
      {drives.map((d) => (
        <button key={d.path} className="drive-card" onClick={() => onOpen(d.path)}>
          <div className="drive-card-head">
            <DriveIcon />
            <span className="drive-name">
              {d.name}
              {d.label && <span className="drive-label muted"> {d.label}</span>}
            </span>
          </div>
          {d.sizeBytes ? (
            <>
              <Bar value={d.usedPercent ?? 0} />
              <div className="drive-meta muted">
                {formatBytes(d.freeBytes ?? 0)} free of {formatBytes(d.sizeBytes)}
              </div>
            </>
          ) : (
            <div className="drive-meta muted">{d.path}</div>
          )}
        </button>
      ))}
    </div>
  );
}

function FileRow({
  e,
  dirSize,
  onOpen,
}: {
  e: FsEntry;
  dirSize?: DirSize;
  onOpen: () => void;
}) {
  const isDir = e.type === "dir";
  return (
    <tr className={isDir ? "row-dir" : ""}>
      <td>
        <button
          className="file-name"
          onClick={isDir ? onOpen : undefined}
          disabled={!isDir}
        >
          {isDir ? <FolderIcon /> : <FileIcon ext={e.ext} />}
          <span className="file-label" title={e.name}>
            {e.name}
          </span>
        </button>
      </td>
      <td className="ta-right muted">
        {isDir ? <DirSizeCell size={dirSize} /> : formatBytes(e.size ?? 0)}
      </td>
      <td className="ta-right muted">{formatDate(e.modifiedMs)}</td>
      <td className="ta-right">
        {!isDir && (
          <a
            className="file-download"
            href={downloadUrl(e.path)}
            title="Download"
          >
            Download
          </a>
        )}
      </td>
    </tr>
  );
}

function DirSizeCell({ size }: { size?: DirSize }) {
  if (!size || size.state === "loading") {
    return <span className="size-loading" title="Calculating…" />;
  }
  if (size.state === "error") return <>—</>;
  if (size.bytes === 0) return <>—</>;
  return (
    <>
      {size.partial ? "≥ " : ""}
      {formatBytes(size.bytes)}
    </>
  );
}

function breadcrumbs(p: string): { label: string; path: string }[] {
  const isWin = p.includes("\\");
  if (isWin) {
    const parts = p.split(/\\+/).filter(Boolean);
    const crumbs: { label: string; path: string }[] = [];
    let acc = "";
    parts.forEach((part, i) => {
      acc = i === 0 ? `${part}\\` : `${acc.replace(/\\$/, "")}\\${part}`;
      crumbs.push({ label: part, path: acc });
    });
    return crumbs;
  }
  const parts = p.split("/").filter(Boolean);
  const crumbs = [{ label: "/", path: "/" }];
  let acc = "";
  parts.forEach((part) => {
    acc += `/${part}`;
    crumbs.push({ label: part, path: acc });
  });
  return crumbs;
}

function FolderIcon() {
  return (
    <svg className="ficon folder" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
    </svg>
  );
}

function FileIcon({ ext }: { ext: string | null }) {
  return (
    <svg className="ficon file" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      {ext && (
        <text x="12" y="16" textAnchor="middle" className="ficon-ext">
          {ext.slice(0, 3)}
        </text>
      )}
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <circle cx="17" cy="12" r="1.2" />
    </svg>
  );
}

function PcIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
