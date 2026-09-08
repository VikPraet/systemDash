import styled, { css } from "styled-components";
import { mobile } from "../../theme/media";

/* ----------------------------------------------------------------------------
   Shared modal primitives + editorial ghost/danger buttons.

   These are reused by several feature components (Files, Editor, Processes,
   Users, Activity, History). Styles reflect the *final* cascade from the old
   global stylesheet, including the trailing "EDITORIAL THEME" overrides.
   ------------------------------------------------------------------------- */

// Backdrop shared by both modal families (the old `.modal-overlay`, whose two
// definitions cascaded into these final values).
export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${({ theme }) => theme.color.overlay};
  backdrop-filter: blur(3px);
  animation: modal-fade 0.12s ease;

  @media ${mobile} {
    padding: 12px;
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    align-items: flex-end;
  }
`;

/* ---- Modal family A: plain panel card (Files / Processes / Editor) -------- */
export const Modal = styled.div<{ $wide?: boolean }>`
  width: 100%;
  max-width: ${({ $wide }) => ($wide ? "480px" : "420px")};
  max-height: min(90vh, 740px);
  overflow: auto;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  padding: 22px;
  box-shadow: 0 18px 50px ${({ theme }) => theme.color.shadow};
  animation: modal-pop 0.14s ease;
`;

export const ModalTitle = styled.h3`
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`;

export const ModalLabel = styled.label`
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
`;

export const ModalInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: 0;
  color: ${({ theme }) => theme.color.text};
  padding: 9px 2px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: ${({ theme }) => theme.color.accent};
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.placeholder};
  }
`;

export const ModalMessage = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text};

  .modal-warn,
  &.modal-warn {
    color: ${({ theme }) => theme.color.bad};
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: ${({ theme }) => theme.color.accent};
  }
`;

export const ModalError = styled.div`
  margin-top: 12px;
  padding: 8px 11px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: color-mix(in srgb, ${({ theme }) => theme.color.bad} 14%, transparent);
  border: 1px solid
    color-mix(in srgb, ${({ theme }) => theme.color.bad} 45%, transparent);
  color: ${({ theme }) => theme.color.bad};
  font-size: 12px;
`;

// Final cascade of the two `.modal-actions` rules (gap 10px / margin-top 4px).
export const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
`;

export type ModalBtnVariant = "default" | "primary" | "danger" | "danger-ghost";

const modalBtnVariant = {
  default: css`
    border-color: ${({ theme }) => theme.color.hairline};
    color: ${({ theme }) => theme.color.text};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.accent};
      border-color: ${({ theme }) => theme.color.accent};
      color: ${({ theme }) => theme.color.onAccent};
    }
  `,
  primary: css`
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.accent};
      border-color: ${({ theme }) => theme.color.accent};
      color: ${({ theme }) => theme.color.onAccent};
    }
  `,
  danger: css`
    border-color: ${({ theme }) => theme.color.bad};
    color: ${({ theme }) => theme.color.bad};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.bad};
      border-color: ${({ theme }) => theme.color.bad};
      color: ${({ theme }) => theme.color.onAccent};
    }
  `,
  "danger-ghost": css`
    border-color: ${({ theme }) => theme.color.bad};
    color: ${({ theme }) => theme.color.bad};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.bad};
      border-color: ${({ theme }) => theme.color.bad};
      color: ${({ theme }) => theme.color.onAccent};
    }
  `,
} as const;

export const ModalBtn = styled.button<{ $variant?: ModalBtnVariant }>`
  padding: 8px 16px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.text};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease,
    color 0.18s ease;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  ${({ $variant = "default" }) => modalBtnVariant[$variant]}
`;

/* ---- Modal family B: gradient "card" with header (Users / Activity) ------ */
export const ModalCard = styled.div`
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.color.panel2},
    ${({ theme }) => theme.color.panel}
  );
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: 0 24px 70px ${({ theme }) => theme.color.shadow};
`;

export const ModalHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    margin: 0;
    font-size: 16px;
  }
`;

export const ModalClose = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
  }
`;

export const ModalSub = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.5;
`;

/* ---- Editorial ghost + solid danger buttons (shared) --------------------- */
export const GhostBtn = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: ${({ $danger }) => ($danger ? "7px" : "8px 12px")};
  background: transparent;
  border: 1px solid
    ${({ $danger, theme }) => ($danger ? theme.color.bad : theme.color.hairline)};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ $danger, theme }) => ($danger ? theme.color.bad : theme.color.text)};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: ${({ $danger, theme }) =>
      $danger ? theme.color.bad : theme.color.accent};
    border-color: ${({ $danger, theme }) =>
      $danger ? theme.color.bad : theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
  }
`;

export const IconBtn = styled.button`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin: 0;
  padding: 0;
  appearance: none;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.icon};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 10%, transparent);
  }
`;

export const DangerBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.bad};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.bad};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease,
    color 0.18s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.bad};
    border-color: ${({ theme }) => theme.color.bad};
    color: ${({ theme }) => theme.color.onAccent};
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

/* ---- Shared data-table base (Processes + Files) -------------------------- */
// Spread into a component's own `styled.table` so each owner can add its own
// row-hover reveal rules without coupling to the other.
export const procTableBase = css`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${({ theme }) => theme.color.panel2};
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: ${({ theme }) => theme.color.muted};
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  thead th:hover {
    color: ${({ theme }) => theme.color.text};
  }

  thead th.sorted {
    color: ${({ theme }) => theme.color.text};
  }

  tbody td {
    padding: 7px 14px;
    border-top: 1px solid ${({ theme }) => theme.color.border};
    vertical-align: middle;
  }

  tbody tr:hover td {
    background: ${({ theme }) => theme.color.panel2};
  }
`;

/* ---- Shared status surfaces --------------------------------------------- */
export const Loading = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  padding: 40px;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};
`;

export const Placeholder = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  padding: 40px;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};

  h2 {
    margin-top: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.4px;
  }
`;

/* ---- Form / modal error box (auth screens + modals) --------------------- */
export const AuthError = styled.div.attrs({ role: "alert" })<{ $inline?: boolean }>`
  padding: 10px 12px;
  background: color-mix(in srgb, ${({ theme }) => theme.color.bad} 12%, transparent);
  border: 1px solid ${({ theme }) => theme.color.bad};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.bad};
  font-size: 12.5px;
  line-height: 1.45;
  ${({ $inline }) => $inline && "margin-bottom: 14px;"}
`;

/* ---- Revoke / confirm detail list + warning (Processes + Activity) ------- */
export const RevokeDetails = styled.dl`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 1px;
  margin: 0;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg};

  > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 12px;
    min-width: 0;
  }

  > div + div {
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }

  dt {
    margin: 0;
    flex: 0 0 auto;
    font-size: 12px;
    color: ${({ theme }) => theme.color.muted};
  }

  dd {
    margin: 0;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    text-align: right;
    overflow-wrap: anywhere;
  }
`;

export const RevokeWarn = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(214, 162, 63, 0.12);
  border: 1px solid ${({ theme }) => theme.color.warn};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.warn};
  font-size: 12.5px;
`;

/* ---- Role badge (sidebar chip + sessions/audit) ------------------------- */
export type RoleName = "admin" | "user" | "viewer" | string;

export const RoleBadge = styled.span<{ $role?: RoleName }>`
  align-self: flex-start;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  padding: 2px 7px;
  line-height: 1.3;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.muted};

  ${({ $role, theme }) =>
    $role === "admin"
      ? css`
          color: ${theme.color.warn};
          border-color: color-mix(in srgb, ${theme.color.warn} 55%, ${theme.color.border});
          background: color-mix(in srgb, ${theme.color.warn} 14%, transparent);
        `
      : $role === "user"
      ? css`
          color: ${theme.color.accent};
          border-color: color-mix(in srgb, ${theme.color.accent} 55%, ${theme.color.border});
          background: color-mix(in srgb, ${theme.color.accent} 12%, transparent);
        `
      : css`
          color: ${theme.color.muted};
        `}
`;

/* ---- Auth submit button (login / setup / user-create) ------------------- */
export const AuthSubmit = styled.button<{ $compact?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: ${({ $compact }) => ($compact ? "0" : "10px")};
  padding: ${({ $compact }) => ($compact ? "9px 16px" : "14px 18px")};
  background: ${({ theme }) => theme.color.accent};
  border: 1px solid ${({ theme }) => theme.color.accent};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.onAccent};
  font-size: ${({ $compact }) => ($compact ? "13px" : "12px")};
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: filter 0.18s ease, opacity 0.18s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
    filter: none;
  }
`;
