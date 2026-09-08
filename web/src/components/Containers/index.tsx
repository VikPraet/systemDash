import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { APP_NAME } from "../../brand";
import {
  dockerContainerAction,
  fetchDockerContainers,
  fetchDockerLogs,
  fetchDockerStatus,
  removeDockerContainer,
} from "../../api";
import { cache } from "../../cache";
import { hasRole, useAuth } from "../../auth/AuthContext";
import type { DockerContainer, DockerStatus } from "../../types";
import {
  DangerBtn,
  GhostBtn,
  Loading,
  ModalActions,
  ModalCard,
  ModalClose,
  ModalError,
  ModalHead,
  ModalMessage,
  ModalOverlay,
  ModalSub,
} from "../ui/styles";
import { Tooltip } from "../ui/Tooltip";
import * as S from "./styles";

const POLL_MS = 3000;

export function Containers() {
  const { user } = useAuth();
  const canManage = hasRole(user, "user");
  const [status, setStatus] = useState<DockerStatus | null>(() => cache.containers.status);
  const [containers, setContainers] = useState<DockerContainer[]>(
    () => cache.containers.containers
  );
  const [error, setError] = useState<string | null>(() => cache.containers.error);
  const [query, setQuery] = useState(() => cache.containers.query);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logsTarget, setLogsTarget] = useState<DockerContainer | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<DockerContainer | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    cache.containers.query = query;
  }, [query]);

  const reload = useCallback(async () => {
    try {
      const st = await fetchDockerStatus();
      cache.containers.status = st;
      setStatus(st);
      if (!st.available) {
        cache.containers.containers = [];
        cache.containers.error = st.error;
        setContainers([]);
        setError(st.error);
        return;
      }
      const data = await fetchDockerContainers();
      cache.containers.containers = data.containers;
      cache.containers.error = null;
      setContainers(data.containers);
      setError(null);
    } catch (e) {
      const message = (e as Error).message;
      cache.containers.error = message;
      setError(message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function tick() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const st = await fetchDockerStatus(ctrl.signal);
        if (cancelled) return;
        cache.containers.status = st;
        setStatus(st);
        if (!st.available) {
          cache.containers.containers = [];
          cache.containers.error = st.error;
          setContainers([]);
          setError(st.error);
          return;
        }
        const data = await fetchDockerContainers(ctrl.signal);
        if (!cancelled) {
          cache.containers.containers = data.containers;
          cache.containers.error = null;
          setContainers(data.containers);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          const message = (e as Error).message;
          cache.containers.error = message;
          setError(message);
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

  useEffect(() => {
    if (!logsTarget) {
      setLogs(null);
      setLogsError(null);
      return;
    }
    let cancelled = false;
    setLogsLoading(true);
    setLogsError(null);
    fetchDockerLogs(logsTarget.id)
      .then((text) => !cancelled && setLogs(text || "(empty)"))
      .catch((e) => !cancelled && setLogsError((e as Error).message))
      .finally(() => !cancelled && setLogsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [logsTarget]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q) ||
        c.ports.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
    );
  }, [containers, query]);

  const running = containers.filter((c) => c.running).length;

  async function act(id: string, action: "start" | "stop" | "restart") {
    if (!canManage || busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await dockerContainerAction(id, action);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!removeTarget || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeDockerContainer(removeTarget.id, removeTarget.running);
      setRemoveTarget(null);
      await reload();
    } catch (e) {
      setRemoveError((e as Error).message);
    } finally {
      setRemoveBusy(false);
    }
  }

  if (!status) {
    return (
      <Loading>
        {error ? `Could not reach Docker: ${error}` : "Checking Docker…"}
      </Loading>
    );
  }

  return (
    <S.DockerRoot>
      <S.DockerToolbar>
        <S.DockerSearch
          type="text"
          placeholder="Filter containers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!status.available}
        />
        <S.DockerSummary>
          <span>
            <strong>{running}</strong> running
          </span>
          <span>
            <strong>{containers.length}</strong> total
          </span>
          {status.version && <span>Docker {status.version}</span>}
        </S.DockerSummary>
        <Tooltip label="Refresh now">
          <GhostBtn onClick={() => void reload()}>
            <RefreshCw size={14} />
          </GhostBtn>
        </Tooltip>
      </S.DockerToolbar>

      {!status.available && (
        <S.DockerBanner $bad>
          <strong>Docker not available.</strong> {status.error}
          {status.hint && (
            <>
              <br />
              <br />
              {status.hint}
            </>
          )}
        </S.DockerBanner>
      )}

      {status.available && containers.length === 0 && !error && (
        <S.DockerBanner>
          No containers found. Game panels such as Pterodactyl run servers as Docker containers —
          they show up here once {APP_NAME} can run <code>docker ps</code> on the host.
        </S.DockerBanner>
      )}

      {error && status.available && (
        <S.DockerBanner $bad>{error}</S.DockerBanner>
      )}

      <S.DockerBody>
        <S.DockerTable>
          <thead>
            <tr>
              <th>Name</th>
              <th>Image</th>
              <th>Status</th>
              <th>Ports</th>
              <th className="ta-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className={c.running ? "row-running" : undefined}
              >
                <td>
                  <div className="mono-sm" title={c.id}>
                    {c.name}
                  </div>
                </td>
                <td className="muted">{c.image}</td>
                <td>
                  <span className={`state-pill${c.running ? " running" : ""}`}>
                    {c.state}
                  </span>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {c.status}
                  </div>
                </td>
                <td className="muted mono-sm">{c.ports || "—"}</td>
                <td className="ta-right">
                  <div className="row-actions">
                    <Tooltip label="Logs">
                      <button
                        className="row-act"
                        onClick={() => setLogsTarget(c)}
                      >
                        <FileText size={14} />
                      </button>
                    </Tooltip>
                    {canManage && !c.running && (
                      <Tooltip label="Start">
                        <button
                          className="row-act"
                          disabled={busyId === c.id}
                          onClick={() => void act(c.id, "start")}
                        >
                          <Play size={14} />
                        </button>
                      </Tooltip>
                    )}
                    {canManage && c.running && (
                      <>
                        <Tooltip label="Stop">
                          <button
                            className="row-act"
                            disabled={busyId === c.id}
                            onClick={() => void act(c.id, "stop")}
                          >
                            <Square size={14} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Restart">
                          <button
                            className="row-act"
                            disabled={busyId === c.id}
                            onClick={() => void act(c.id, "restart")}
                          >
                            <RotateCcw size={14} />
                          </button>
                        </Tooltip>
                      </>
                    )}
                    {canManage && (
                      <Tooltip label="Remove">
                        <button
                          className="row-act danger"
                          disabled={busyId === c.id}
                          onClick={() => {
                            setRemoveError(null);
                            setRemoveTarget(c);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {status.available && rows.length === 0 && containers.length > 0 && (
              <tr>
                <td colSpan={5} className="muted proc-empty">
                  No matching containers.
                </td>
              </tr>
            )}
          </tbody>
        </S.DockerTable>
      </S.DockerBody>

      {logsTarget && (
        <ModalOverlay
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLogsTarget(null);
          }}
        >
          <S.LogsModalCard onMouseDown={(e) => e.stopPropagation()}>
            <ModalHead>
              <div>
                <h3>Logs — {logsTarget.name}</h3>
                <ModalSub>{logsTarget.image}</ModalSub>
              </div>
              <ModalClose type="button" onClick={() => setLogsTarget(null)} aria-label="Close">
                <X size={16} strokeWidth={1.8} />
              </ModalClose>
            </ModalHead>
            <S.LogsBody>
              {logsLoading ? (
                <Loading>Loading logs…</Loading>
              ) : logsError ? (
                <S.DockerBanner $bad>{logsError}</S.DockerBanner>
              ) : (
                <S.LogsPre>{logs}</S.LogsPre>
              )}
            </S.LogsBody>
            <ModalActions>
              <GhostBtn onClick={() => setLogsTarget(null)}>Close</GhostBtn>
            </ModalActions>
          </S.LogsModalCard>
        </ModalOverlay>
      )}

      {removeTarget && (
        <ModalOverlay
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !removeBusy) setRemoveTarget(null);
          }}
        >
          <ModalCard onMouseDown={(e) => e.stopPropagation()}>
            <ModalHead>
              <h3>Remove container?</h3>
              <ModalClose
                type="button"
                onClick={() => !removeBusy && setRemoveTarget(null)}
                aria-label="Close"
              >
                <X size={16} strokeWidth={1.8} />
              </ModalClose>
            </ModalHead>
            <ModalMessage>
              Permanently remove <strong>{removeTarget.name}</strong> ({removeTarget.image})?
              {removeTarget.running && (
                <span className="modal-warn">
                  {" "}
                  It is still running — it will be force-stopped and removed.
                </span>
              )}
            </ModalMessage>
            {removeError && <ModalError>{removeError}</ModalError>}
            <ModalActions>
              <GhostBtn
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={removeBusy}
              >
                Cancel
              </GhostBtn>
              <DangerBtn type="button" onClick={() => void confirmRemove()} disabled={removeBusy}>
                {removeBusy ? "Removing…" : "Remove"}
              </DangerBtn>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
    </S.DockerRoot>
  );
}
