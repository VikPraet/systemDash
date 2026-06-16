import styled, { css } from "styled-components";

export const DropdownRoot = styled.div`
  position: relative;
  display: inline-flex;
  width: 100%;
`;

const triggerActive = css`
  border-color: ${({ theme }) => theme.color.accent};
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.18);
`;

export const DropdownTrigger = styled.button<{ $open?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 9px 11px;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.text};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.accent};
  }

  &:focus-visible {
    ${triggerActive}
  }

  ${({ $open }) => $open && triggerActive}

  .dropdown-chevron {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.muted};
    transition: transform 0.18s ease;
    ${({ $open }) => $open && "transform: rotate(180deg);"}
  }
`;

export const DropdownValue = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// Portalled to <body>, so this must be a standalone styled component.
export const DropdownMenu = styled.ul`
  position: fixed;
  z-index: 200;
  margin: 0;
  padding: 5px;
  list-style: none;
  max-height: 280px;
  overflow-y: auto;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  animation: dropdown-in 0.12s ease;

  li {
    margin: 0;
  }
`;

export const DropdownItem = styled.button<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: ${({ $selected, theme }) =>
    $selected ? theme.color.accent : theme.color.text};
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.panel};
  }
`;

export const DropdownItemMain = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

export const DropdownItemLabel = styled.span`
  font-weight: 600;
`;

export const DropdownItemHint = styled.span`
  font-size: 11.5px;
  color: ${({ theme }) => theme.color.muted};
  font-weight: 400;
`;
