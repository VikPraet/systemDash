import styled, { css } from "styled-components";

export const UsersTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const UsersHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;

  h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.4px;
  }
`;

export const CreateForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
`;

// Editorial ghost/underline input (final cascade over the base `.user-create input`).
export const CreateInput = styled.input`
  flex: 1;
  min-width: 150px;
  padding: 9px 2px;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: 0;
  color: ${({ theme }) => theme.color.text};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.color.accent};
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }

  &::placeholder {
    color: rgba(230, 237, 246, 0.35);
  }
`;

// Editorial ghost button (final cascade over the base accent `.user-create button`).
export const CreateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
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

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.accent};
    border-color: ${({ theme }) => theme.color.accent};
    color: #fff;
  }
`;

// Reproduces `.user-create .dropdown { min-width:130px; flex:0 0 auto; width:150px; }`.
// The Dropdown root is `width: 100%`, so this fixed-width wrapper sizes it.
export const DropdownWrap = styled.div`
  min-width: 130px;
  flex: 0 0 auto;
  width: 150px;
`;

export const UsersTable = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  overflow: hidden;
`;

export const UsersRow = styled.div`
  display: grid;
  grid-template-columns: 1.4fr 1fr 0.9fr 1.2fr 0.9fr;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 13px;

  &:first-child {
    border-top: none;
  }
`;

export const UsersRowHead = styled(UsersRow)`
  background: ${({ theme }) => theme.color.panel2};
  color: ${({ theme }) => theme.color.muted};
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

export const UserName = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
`;

export const SelfBadge = styled.span`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.track};
  color: ${({ theme }) => theme.color.muted};
`;

export const StatusPill = styled.button<{ $state?: "on" | "off" }>`
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border};
  font-size: 12px;
  cursor: pointer;
  background: transparent;

  ${({ $state, theme }) =>
    $state === "on"
      ? css`
          color: ${theme.color.good};
          border-color: ${theme.color.good};
          background: rgba(51, 201, 142, 0.1);
        `
      : $state === "off"
      ? css`
          color: ${theme.color.bad};
          border-color: ${theme.color.bad};
          background: rgba(232, 106, 111, 0.1);
        `
      : null}

  &:disabled {
    cursor: default;
    opacity: 0.7;
  }
`;

export const UserActions = styled.span`
  display: inline-flex;
  gap: 8px;
`;

export const ActionBtn = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;

  &:hover:not(:disabled) {
    color: ${({ $danger, theme }) =>
      $danger ? theme.color.bad : theme.color.text};
    border-color: ${({ $danger, theme }) =>
      $danger ? theme.color.bad : theme.color.accent};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

// The editorial ghost/underline label+input pair (`.auth-field`).
export const AuthField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};

  input {
    padding: 11px 2px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: 15px;
    font-weight: 400;
    letter-spacing: 0.2px;
    text-transform: none;
    outline: none;
    transition: border-color 0.18s ease;
  }

  input::placeholder {
    color: rgba(230, 237, 246, 0.35);
  }

  input:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }
`;
