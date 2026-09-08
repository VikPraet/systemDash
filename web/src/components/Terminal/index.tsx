import { useCallback, useEffect, useRef, useState } from "react";
import {
  Columns2,
  Plus,
  Rows2,
  Settings,
  X,
  PanelLeftClose,
} from "lucide-react";
import { APP_NAME } from "../../brand";
import { cache } from "../../cache";
import { randomId } from "../../randomId";
import { fetchSettings, saveSettings } from "../../api";
import type { Settings as AppSettings, TerminalSettings } from "../../types";
import { TerminalPane, closeTerminalTabSession } from "./TerminalPane";
import {
  syncTerminalLayout,
  type TerminalPaneId,
  type TerminalSplitMode,
  type TerminalTabState,
} from "./terminalPersist";
import { Tooltip } from "../ui/Tooltip";
import {
  GhostBtn,
  Modal,
  ModalActions,
  ModalBtn,
  ModalError,
  ModalInput,
  ModalLabel,
  ModalOverlay,
  ModalTitle,
} from "../ui/styles";
import * as S from "./styles";

type SplitMode = TerminalSplitMode;
type PaneId = TerminalPaneId;
type TerminalTab = TerminalTabState;
function parseShellNumber(title: string): number | null {
  const match = /^Shell (\d+)$/.exec(title.trim());
  return match ? Number.parseInt(match[1], 10) : null;
}

function nextFreeShellTitle(tabs: TerminalTab[]): string {
  const used = new Set<number>();
  for (const tab of tabs) {
    const n = parseShellNumber(tab.title);
    if (n !== null) used.add(n);
  }
  let i = 1;
  while (used.has(i)) i += 1;
  return `Shell ${i}`;
}

function newTab(tabs: TerminalTab[]): TerminalTab {
  return { id: randomId(), title: nextFreeShellTitle(tabs) };
}

function paneHomeCell(
  tabId: string,
  splitMode: SplitMode,
  secondaryTabId: string | null
): "main" | "primary" | "secondary" {
  if (splitMode === "none") return "main";
  if (tabId === secondaryTabId) return "secondary";
  return "primary";
}

function paneCells(splitMode: SplitMode): Array<"main" | "primary" | "secondary"> {
  return splitMode === "none" ? ["main"] : ["primary", "secondary"];
}

interface TerminalTabButtonProps {
  tab: TerminalTab;
  active: boolean;
  closable: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
}

function TerminalTabButton({
  tab,
  active,
  closable,
  onSelect,
  onClose,
  onRename,
}: TerminalTabButtonProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(tab.title);
  }, [tab.title, editing]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [editing]);

  function commitRename() {
    const next = draft.trim();
    if (next && next !== tab.title) onRename(next);
    setEditing(false);
  }

  function cancelRename() {
    setDraft(tab.title);
    setEditing(false);
  }

  return (
    <S.TerminalTabBtn
      type="button"
      $active={active}
      onClick={() => !editing && onSelect()}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {editing ? (
        <S.TerminalTabRenameInput
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelRename();
            }
          }}
          onBlur={commitRename}
        />
      ) : (
        <S.TerminalTabTitle title="Double-click to rename">{tab.title}</S.TerminalTabTitle>
      )}
      {closable && !editing && (
        <S.TerminalTabClose
          type="button"
          aria-label={`Close ${tab.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X size={12} strokeWidth={2} />
        </S.TerminalTabClose>
      )}
    </S.TerminalTabBtn>
  );
}

export function Terminal({ active = true }: { active?: boolean }) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [...cache.terminal.tabs]);
  const [primaryTabId, setPrimaryTabId] = useState(() => cache.terminal.primaryTabId);
  const [secondaryTabId, setSecondaryTabId] = useState<string | null>(
    () => cache.terminal.secondaryTabId
  );
  const [splitMode, setSplitMode] = useState<SplitMode>(() => cache.terminal.splitMode);
  const [focusedPane, setFocusedPane] = useState<PaneId>(() => cache.terminal.focusedPane);
  const [settings, setSettings] = useState<AppSettings>(() => cache.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((s) => {
        if (cancelled) return;
        cache.settings = s;
        setSettings(s);
      })
      .catch(() => {
        // Keep cached/default settings if the request fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    syncTerminalLayout({
      tabs,
      primaryTabId,
      secondaryTabId,
      splitMode,
      focusedPane,
    });
  }, [tabs, primaryTabId, secondaryTabId, splitMode, focusedPane]);
  const activeTabId =
    splitMode === "none"
      ? primaryTabId
      : focusedPane === "primary"
        ? primaryTabId
        : (secondaryTabId ?? primaryTabId);

  const selectTab = useCallback(
    (id: string) => {
      if (focusedPane === "primary") setPrimaryTabId(id);
      else setSecondaryTabId(id);
    },
    [focusedPane]
  );

  function addTab() {
    const tab = newTab(tabs);
    setTabs((prev) => [...prev, tab]);
    if (splitMode !== "none" && focusedPane === "secondary") {
      setSecondaryTabId(tab.id);
    } else {
      setPrimaryTabId(tab.id);
      setFocusedPane("primary");
    }
  }

  function renameTab(id: string, title: string) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.id !== id);
      closeTerminalTabSession(id);

      const pickNeighbor = (current: string) => {
        if (current !== id) return current;
        const oldIdx = prev.findIndex((t) => t.id === id);
        return next[Math.min(oldIdx, next.length - 1)]?.id ?? next[0].id;
      };

      setPrimaryTabId((p) => pickNeighbor(p));
      setSecondaryTabId((s) => (s ? pickNeighbor(s) : s));

      if (splitMode !== "none" && next.length < 2) {
        setSplitMode("none");
        setSecondaryTabId(null);
      }

      return next;
    });
  }

  function openSplit(mode: "horizontal" | "vertical") {
    setSplitMode(mode);
    if (secondaryTabId && tabs.some((t) => t.id === secondaryTabId)) return;
    if (tabs.length >= 2) {
      const other = tabs.find((t) => t.id !== primaryTabId);
      setSecondaryTabId(other?.id ?? tabs[0].id);
      setFocusedPane("secondary");
      return;
    }
    const tab = newTab(tabs);
    setTabs((prev) => [...prev, tab]);
    setSecondaryTabId(tab.id);
    setFocusedPane("secondary");
  }

  function closeSplit() {
    setSplitMode("none");
    setFocusedPane("primary");
  }

  function isTabVisible(id: string): boolean {
    if (splitMode === "none") return id === primaryTabId;
    return id === primaryTabId || id === secondaryTabId;
  }

  return (
    <S.TerminalRoot>
      <S.TerminalBar>
        <S.TerminalTabs>
          {tabs.map((tab) => (
            <TerminalTabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              closable={tabs.length > 1}
              onSelect={() => selectTab(tab.id)}
              onClose={() => closeTab(tab.id)}
              onRename={(title) => renameTab(tab.id, title)}
            />
          ))}
          <Tooltip label="New terminal">
            <GhostBtn type="button" onClick={addTab} style={{ padding: "7px" }}>
              <Plus size={15} strokeWidth={2} />
            </GhostBtn>
          </Tooltip>
        </S.TerminalTabs>
        <S.TerminalBarActions>
          {splitMode === "none" ? (
            <>
              <Tooltip label="Split side by side">
                <GhostBtn
                  type="button"
                  onClick={() => openSplit("horizontal")}
                  style={{ padding: "7px" }}
                >
                  <Columns2 size={15} strokeWidth={1.8} />
                </GhostBtn>
              </Tooltip>
              <Tooltip label="Split stacked">
                <GhostBtn
                  type="button"
                  onClick={() => openSplit("vertical")}
                  style={{ padding: "7px" }}
                >
                  <Rows2 size={15} strokeWidth={1.8} />
                </GhostBtn>
              </Tooltip>
            </>
          ) : (
            <Tooltip label="Close split">
              <GhostBtn type="button" onClick={closeSplit} style={{ padding: "7px" }}>
                <PanelLeftClose size={15} strokeWidth={1.8} />
              </GhostBtn>
            </Tooltip>
          )}
          <Tooltip label="Terminal settings">
            <GhostBtn
              type="button"
              onClick={() => setSettingsOpen(true)}
              style={{ padding: "7px" }}
            >
              <Settings size={15} strokeWidth={1.8} />
            </GhostBtn>
          </Tooltip>
          <S.TerminalHint>
            {settings.terminal?.osUser
              ? `${settings.terminal.osUser} · local shell`
              : "service user · local shell"}
          </S.TerminalHint>
        </S.TerminalBarActions>
      </S.TerminalBar>

      <S.TerminalBody>
        <S.TerminalPaneArea $split={splitMode}>
          {paneCells(splitMode).map((cell) => (
            <S.TerminalPaneStack
              key={cell}
              $cell={cell}
              $focused={
                splitMode !== "none" &&
                ((cell === "primary" && focusedPane === "primary") ||
                  (cell === "secondary" && focusedPane === "secondary"))
              }
              onMouseDown={() => {
                if (splitMode !== "none") {
                  setFocusedPane(cell === "secondary" ? "secondary" : "primary");
                }
              }}
            >
              {tabs
                .filter(
                  (tab) =>
                    paneHomeCell(tab.id, splitMode, secondaryTabId) === cell
                )
                .map((tab) => {
                  const visible = isTabVisible(tab.id) && active;
                  const focused =
                    splitMode === "none"
                      ? tab.id === primaryTabId
                      : cell === "primary"
                        ? focusedPane === "primary" && tab.id === primaryTabId
                        : focusedPane === "secondary" && tab.id === secondaryTabId;
                  return (
                    <TerminalPane
                      key={tab.id}
                      tabId={tab.id}
                      visible={visible}
                      focused={focused}
                      onFocus={() => {
                        if (splitMode === "none" || cell === "primary") {
                          setFocusedPane("primary");
                        } else {
                          setFocusedPane("secondary");
                        }
                      }}
                    />
                  );
                })}
            </S.TerminalPaneStack>
          ))}
        </S.TerminalPaneArea>
      </S.TerminalBody>

      {settingsOpen && (
        <TerminalSettingsDialog
          settings={settings}
          onCancel={() => setSettingsOpen(false)}
          onSaved={(s) => {
            cache.settings = s;
            setSettings(s);
            setSettingsOpen(false);
          }}
        />
      )}
    </S.TerminalRoot>
  );
}

const OS_USERNAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function TerminalSettingsDialog({
  settings,
  onCancel,
  onSaved,
}: {
  settings: AppSettings;
  onCancel: () => void;
  onSaved: (s: AppSettings) => void;
}) {
  const [osUser, setOsUser] = useState(settings.terminal?.osUser ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function save() {
    if (busy) return;
    const trimmed = osUser.trim();
    if (trimmed && (trimmed.length > 32 || !OS_USERNAME_RE.test(trimmed))) {
      setError("Use a Linux username: letters, numbers, dot, dash, underscore.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const terminal: TerminalSettings = { osUser: trimmed };
      const saved = await saveSettings({ ...settings, terminal });
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const exampleUser = trimmedOsExample(osUser);

  return (
    <ModalOverlay
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <Modal role="dialog" aria-modal="true">
        <ModalTitle as="h3">Host shell user</ModalTitle>
        <S.SettingsBlurb>
          Optional and stored only on this machine. Leave empty to open the
          terminal as whoever runs {APP_NAME}. If you set a Linux username and
          the service is running as root, new tabs switch with{" "}
          <code>su - {exampleUser}</code> into that account’s home. Files →
          Home follows it too.
        </S.SettingsBlurb>
        <S.SettingsField>
          <ModalLabel htmlFor="terminal-os-user">Linux username</ModalLabel>
          <ModalInput
            id="terminal-os-user"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="not set"
            value={osUser}
            onChange={(e) => setOsUser(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
          />
        </S.SettingsField>
        {error && <ModalError>{error}</ModalError>}
        <ModalActions>
          <ModalBtn type="button" onClick={onCancel}>
            Cancel
          </ModalBtn>
          <ModalBtn type="button" $variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </ModalBtn>
        </ModalActions>
      </Modal>
    </ModalOverlay>
  );
}

function trimmedOsExample(value: string): string {
  const t = value.trim();
  return t && OS_USERNAME_RE.test(t) ? t : "username";
}
