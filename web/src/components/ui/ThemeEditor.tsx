import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAppearance } from "../../theme/AppearanceContext";
import {
  isBuiltinThemeId,
  type Appearance,
  type Atmosphere,
  type BarStyle,
  type DashTheme,
  type GaugeStyle,
  type ThemeEffects,
  type TokenKey,
} from "../../theme/schema";
import { parseHexColor, resolvedClone, slugifyThemeId, uniqueThemeId } from "../../theme/edit";
import { Dropdown } from "../Dropdown";
import {
  AuthError,
  AuthSubmit,
  GhostBtn,
  ModalActions,
  ModalClose,
  ModalHead,
} from "./styles";
import * as S from "./ThemeEditor.styles";

const COLOR_FIELDS: Array<{ key: TokenKey; label: string }> = [
  { key: "bg", label: "Background" },
  { key: "panel", label: "Panel" },
  { key: "panel2", label: "Panel 2" },
  { key: "sidebar", label: "Sidebar" },
  { key: "border", label: "Border" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted" },
  { key: "accent", label: "Accent" },
  { key: "track", label: "Track" },
  { key: "good", label: "Good" },
  { key: "warn", label: "Warn" },
  { key: "bad", label: "Bad" },
  { key: "onAccent", label: "On accent" },
  { key: "knob", label: "Knob" },
  { key: "authDot", label: "Auth dots" },
  { key: "authGlow", label: "Auth glow" },
  { key: "authPanel", label: "Auth panel" },
];

const EXTRA_FIELDS: Array<{ key: TokenKey; label: string; hint: string }> = [
  { key: "radius", label: "Radius", hint: "4px" },
  { key: "radiusSm", label: "Small radius", hint: "2px" },
  { key: "radiusIcon", label: "Icon radius", hint: "2px" },
  { key: "hairline", label: "Hairline", hint: "rgba(…)" },
  { key: "overlay", label: "Overlay", hint: "rgba(…)" },
  { key: "shadow", label: "Shadow", hint: "rgba(…)" },
  { key: "elev", label: "Elevation", hint: "inset 0 1px 0 …" },
  { key: "glow1", label: "Glow 1", hint: "rgba(…)" },
  { key: "glow2", label: "Glow 2", hint: "rgba(…)" },
];

const GAUGE_OPTS: Array<{ value: GaugeStyle; label: string }> = [
  { value: "circle", label: "Circle" },
  { value: "squircle", label: "Squircle" },
  { value: "square", label: "Square" },
];
const BAR_OPTS: Array<{ value: BarStyle; label: string }> = [
  { value: "pill", label: "Pill" },
  { value: "square", label: "Square" },
];
const ATMO_OPTS: Array<{ value: Atmosphere; label: string }> = [
  { value: "glow", label: "Glow" },
  { value: "scanline", label: "Scanline" },
  { value: "none", label: "Flat" },
];

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const hex = parseHexColor(value);
  return (
    <S.Field>
      <span>{label}</span>
      <S.ColorRow>
        <S.ColorSwatch
          type="color"
          value={hex ?? "#888888"}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
        <S.TextInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </S.ColorRow>
    </S.Field>
  );
}

export function ThemeEditor({
  source,
  mode,
  takenIds,
  onClose,
}: {
  source: DashTheme;
  mode: "create" | "edit";
  takenIds: Set<string>;
  onClose: () => void;
}) {
  const { appearance, catalog, importTheme, setPreview } = useAppearance();
  const initial = useMemo(() => {
    if (mode === "edit" && !isBuiltinThemeId(source.id)) {
      return resolvedClone(source, source.id, source.name);
    }
    const name = mode === "create" ? `${source.name} copy` : source.name;
    const id = uniqueThemeId(slugifyThemeId(name), takenIds);
    return resolvedClone(source, id, name);
  }, [mode, source, takenIds]);

  const [draft, setDraft] = useState<DashTheme>(initial);
  const [tab, setTab] = useState<Appearance>(appearance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idTouched, setIdTouched] = useState(false);
  const idLocked = mode === "edit" && !isBuiltinThemeId(source.id);

  useEffect(() => {
    setPreview(draft, tab);
  }, [draft, setPreview, tab]);

  useEffect(() => {
    return () => setPreview(null);
  }, [setPreview]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tokens = draft.modes[tab]?.tokens ?? {};
  const effects: ThemeEffects = draft.modes[tab]?.effects ?? {
    gauge: "circle",
    bars: "pill",
    atmosphere: "glow",
  };

  function patchMode(patch: { tokens?: Partial<typeof tokens>; effects?: Partial<ThemeEffects> }) {
    setDraft((current) => {
      const modeTokens = current.modes[tab]?.tokens ?? {};
      const modeEffects = current.modes[tab]?.effects ?? effects;
      return {
        ...current,
        modes: {
          ...current.modes,
          [tab]: {
            tokens: { ...modeTokens, ...patch.tokens },
            effects: { ...modeEffects, ...patch.effects },
          },
        },
      };
    });
  }

  function copyToOther() {
    const other: Appearance = tab === "dark" ? "light" : "dark";
    const from = draft.modes[tab];
    if (!from) return;
    setDraft((current) => ({
      ...current,
      modes: { ...current.modes, [other]: structuredClone(from) },
    }));
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      setError("Give the theme a name");
      return;
    }
    const id = draft.id.trim();
    if (!id) {
      setError("Theme id is missing");
      return;
    }
    if (isBuiltinThemeId(id)) {
      setError("That id is a built-in theme — pick another");
      return;
    }
    const takenByOther = catalog.some((t) => t.id === id && t.id !== source.id);
    if (mode === "create" && (takenIds.has(id) || takenByOther)) {
      setError(`A theme named "${id}" already exists`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await importTheme(draft);
      setPreview(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save theme");
      setBusy(false);
    }
  }

  return createPortal(
    <S.EditorOverlay onClick={onClose} role="presentation">
      <S.EditorCard
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-editor-title"
      >
        <ModalHead>
          <h3 id="theme-editor-title">{mode === "edit" ? "Edit theme" : "New theme"}</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.8} />
          </ModalClose>
        </ModalHead>
        <S.Hint>
          Changes paint the dash live. Save writes a JSON theme on this machine; Cancel
          restores the previous look.
        </S.Hint>

        <S.MetaGrid>
          <S.Field>
            <span>Name</span>
            <S.TextInput
              value={draft.name}
              onChange={(e) => {
                const name = e.target.value;
                setDraft((current) => ({
                  ...current,
                  name,
                  id:
                    idLocked || idTouched
                      ? current.id
                      : uniqueThemeId(slugifyThemeId(name || "custom-theme"), takenIds),
                }));
              }}
              autoFocus
            />
          </S.Field>
          <S.Field>
            <span>Id</span>
            <S.TextInput
              value={draft.id}
              disabled={idLocked}
              onChange={(e) => {
                setIdTouched(true);
                setDraft((current) => ({
                  ...current,
                  id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                }));
              }}
            />
          </S.Field>
        </S.MetaGrid>

        <S.Toolbar>
          <S.Seg>
            <button
              type="button"
              className={tab === "dark" ? "active" : ""}
              onClick={() => setTab("dark")}
            >
              Dark
            </button>
            <button
              type="button"
              className={tab === "light" ? "active" : ""}
              onClick={() => setTab("light")}
            >
              Light
            </button>
          </S.Seg>
          <GhostBtn type="button" onClick={copyToOther}>
            Copy to {tab === "dark" ? "light" : "dark"}
          </GhostBtn>
        </S.Toolbar>

        <S.Scroll>
          <S.SectionLabel>Effects</S.SectionLabel>
          <S.EffectsRow>
            <S.Field>
              <span>Gauge</span>
              <Dropdown
                value={effects.gauge}
                options={GAUGE_OPTS}
                onChange={(gauge) => patchMode({ effects: { gauge } })}
                ariaLabel="Gauge style"
                variant="underline"
              />
            </S.Field>
            <S.Field>
              <span>Bars</span>
              <Dropdown
                value={effects.bars}
                options={BAR_OPTS}
                onChange={(bars) => patchMode({ effects: { bars } })}
                ariaLabel="Bar style"
                variant="underline"
              />
            </S.Field>
            <S.Field>
              <span>Atmosphere</span>
              <Dropdown
                value={effects.atmosphere}
                options={ATMO_OPTS}
                onChange={(atmosphere) => patchMode({ effects: { atmosphere } })}
                ariaLabel="Atmosphere"
                variant="underline"
              />
            </S.Field>
          </S.EffectsRow>

          <S.SectionLabel>Colors</S.SectionLabel>
          <S.ColorGrid>
            {COLOR_FIELDS.map((field) => (
              <ColorField
                key={field.key}
                label={field.label}
                value={tokens[field.key] ?? ""}
                onChange={(next) => patchMode({ tokens: { [field.key]: next } })}
              />
            ))}
          </S.ColorGrid>

          <S.SectionLabel>Details</S.SectionLabel>
          <S.ColorGrid>
            {EXTRA_FIELDS.map((field) => (
              <S.Field key={field.key}>
                <span>{field.label}</span>
                <S.TextInput
                  value={tokens[field.key] ?? ""}
                  placeholder={field.hint}
                  onChange={(e) => patchMode({ tokens: { [field.key]: e.target.value } })}
                  spellCheck={false}
                />
              </S.Field>
            ))}
          </S.ColorGrid>
        </S.Scroll>

        {error && <AuthError $inline>{error}</AuthError>}
        <ModalActions>
          <GhostBtn type="button" onClick={onClose}>
            Cancel
          </GhostBtn>
          <AuthSubmit type="button" $compact disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save theme"}
          </AuthSubmit>
        </ModalActions>
      </S.EditorCard>
    </S.EditorOverlay>,
    document.body
  );
}
