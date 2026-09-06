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
  background: rgba(5, 8, 13, 0.6);
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
export const Modal = styled.div`
  width: 100%;
  max-width: 420px;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  padding: 22px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
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
    color: rgba(230, 237, 246, 0.35);
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
    border-color: rgba(255, 255, 255, 0.22);
    color: ${({ theme }) => theme.color.text};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.accent};
      border-color: ${({ theme }) => theme.color.accent};
      color: #fff;
    }
  `,
  primary: css`
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.accent};
      border-color: ${({ theme }) => theme.color.accent};
      color: #fff;
    }
  `,
  danger: css`
    border-color: ${({ theme }) => theme.color.bad};
    color: ${({ theme }) => theme.color.bad};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.bad};
      border-color: ${({ theme }) => theme.color.bad};
      color: #fff;
    }
  `,
  "danger-ghost": css`
    border-color: ${({ theme }) => theme.color.bad};
    color: ${({ theme }) => theme.color.bad};
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.bad};
      border-color: ${({ theme }) => theme.color.bad};
      color: #fff;
    }
  `,
} as const;

export const ModalBtn = styled.button<{ $variant?: ModalBtnVariant }>`
  padding: 8px 16px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.22);
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
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
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
    ${({ $danger, theme }) =>
      $danger ? theme.color.bad : "rgba(255, 255, 255, 0.22)"};
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
    color: #fff;
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
    color: #fff;
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
export const AuthError = styled.div<{ $inline?: boolean }>`
  padding: 10px 12px;
  background: rgba(232, 106, 111, 0.12);
  border: 1px solid ${({ theme }) => theme.color.bad};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: #f6c1c3;
  font-size: 12.5px;
  ${({ $inline }) => $inline && "margin-bottom: 14px;"}
`;

/* ---- Revoke / confirm detail list + warning (Processes + Activity) ------- */
export const RevokeDetails = styled.dl`
  display: flex;
  flex-direction: column;
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
  }

  > div + div {
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }

  dt {
    margin: 0;
    font-size: 12px;
    color: ${({ theme }) => theme.color.muted};
  }

  dd {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
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
  color: #eccb88;
  font-size: 12.5px;
`;

/* ---- Brand dot (sidebar + auth screens) --------------------------------- */
export const BrandDot = styled.span`
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    ${({ theme }) => theme.color.accent},
    ${({ theme }) => theme.color.good}
  );
  box-shadow: 0 0 14px ${({ theme }) => theme.color.accent};
  animation: pulse 2.4s ease-in-out infinite;
`;

/* ---- Role badge (sidebar chip + sessions/audit) ------------------------- */
export type RoleName = "admin" | "user" | "viewer" | string;

export const RoleBadge = styled.span<{ $role?: RoleName }>`
  align-self: flex-start;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 7px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.muted};

  ${({ $role, theme }) =>
    $role === "admin"
      ? css`
          color: #eccb88;
          border-color: ${theme.color.warn};
          background: rgba(214, 162, 63, 0.12);
        `
      : $role === "user"
      ? css`
          color: #bfdbfe;
          border-color: ${theme.color.accent};
          background: rgba(79, 140, 255, 0.12);
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
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 2px;
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ $compact }) => ($compact ? "13px" : "12px")};
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease,
    color 0.18s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.accent};
    border-color: ${({ theme }) => theme.color.accent};
    color: #fff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;
