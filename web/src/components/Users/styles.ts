import { Link } from "react-router-dom";
import styled, { css } from "styled-components";
import { mobile } from "../../theme/media";

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

  @media ${mobile} {
    h2 {
      font-size: 22px;
    }
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
  box-shadow: ${({ theme }) => theme.elev};

  @media ${mobile} {
    flex-direction: column;
    align-items: stretch;
    padding: 12px;
  }
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
    color: ${({ theme }) => theme.color.placeholder};
  }
`;

// Editorial ghost button (final cascade over the base accent `.user-create button`).
export const CreateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
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

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.accent};
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
  }
`;

// Reproduces `.user-create .dropdown { min-width:130px; flex:0 0 auto; width:150px; }`.
// The Dropdown root is `width: 100%`, so this fixed-width wrapper sizes it.
export const DropdownWrap = styled.div`
  min-width: 130px;
  flex: 0 0 auto;
  width: 150px;

  @media ${mobile} {
    width: 100%;
    min-width: 0;
  }
`;

export const UsersTable = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: ${({ theme }) => theme.elev};
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

  @media ${mobile} {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "name actions"
      "role role"
      "status created";
    gap: 8px 10px;
    padding: 12px 14px;
    font-size: 12px;
  }
`;

export const UsersRowHead = styled(UsersRow)`
  background: ${({ theme }) => theme.color.panel2};
  color: ${({ theme }) => theme.color.muted};
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.4px;

  @media ${mobile} {
    display: none;
  }
`;

export const UserName = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;

  @media ${mobile} {
    grid-area: name;
    flex-wrap: wrap;
  }
`;

export const UsersRole = styled.span`
  @media ${mobile} {
    grid-area: role;
  }
`;

export const UsersStatus = styled.span`
  @media ${mobile} {
    grid-area: status;
  }
`;

export const UsersCreated = styled.span`
  @media ${mobile} {
    grid-area: created;
    text-align: right;
    font-size: 11px;
  }
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

  @media ${mobile} {
    grid-area: actions;
    align-self: start;
  }
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
    border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
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
    color: ${({ theme }) => theme.color.placeholder};
  }

  input:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }
`;

export const WidgetRoot = styled.div`
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const WidgetMeta = styled.div`
  font-size: 12px;
`;

export const WidgetList = styled.div`
  min-height: 0;
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  margin: 0 -4px;
`;

export const WidgetRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "dot name when"
    ". action action";
  align-items: center;
  column-gap: 8px;
  row-gap: 2px;
  padding: 9px 4px;
  border-top: 1px solid ${({ theme }) => theme.color.hairline};
  font-size: 13px;

  &:first-child {
    border-top: none;
    padding-top: 0;
  }
`;

export const OnlineDot = styled.span<{ $on?: boolean }>`
  grid-area: dot;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $on, theme }) => ($on ? theme.color.good : theme.color.track)};
  box-shadow: ${({ $on, theme }) =>
    $on ? `0 0 0 3px color-mix(in srgb, ${theme.color.good} 22%, transparent)` : "none"};
`;

export const WidgetName = styled.span`
  grid-area: name;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const WidgetWhen = styled.span<{ $live?: boolean }>`
  grid-area: when;
  font-size: 11px;
  white-space: nowrap;
  color: ${({ $live, theme }) => ($live ? theme.color.good : theme.color.muted)};
`;

export const WidgetAction = styled.span<{ $alert?: boolean }>`
  grid-area: action;
  min-width: 0;
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ $alert, theme }) => ($alert ? theme.color.bad : theme.color.muted)};
`;

export const WidgetFoot = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
  color: ${({ theme }) => theme.color.accent};
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
