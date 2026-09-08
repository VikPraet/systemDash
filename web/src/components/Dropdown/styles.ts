import styled, { css } from "styled-components";

export const DropdownRoot = styled.div`
  position: relative;
  display: inline-flex;
  width: 100%;
`;

const triggerActive = css`
  border-color: ${({ theme }) => theme.color.accent};
  box-shadow: 0 0 0 3px ${({ theme }) => theme.color.accentRing};
`;

export const DropdownTrigger = styled.button<{
  $open?: boolean;
  $variant?: "default" | "underline";
}>`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  cursor: pointer;
  outline: none;
  text-transform: none;
  letter-spacing: 0.2px;
  color: ${({ theme }) => theme.color.text};
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  .dropdown-chevron {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.muted};
    transition: transform 0.18s ease;
    ${({ $open }) => $open && "transform: rotate(180deg);"}
  }

  ${({ $variant, $open, theme }) =>
    $variant === "underline"
      ? css`
          padding: 11px 2px;
          background: transparent;
          border: none;
          border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
          border-radius: 0;
          font-size: 15px;
          font-weight: 400;

          &:hover,
          &:focus-visible {
            border-bottom-color: ${theme.color.accent};
          }

          ${$open &&
          css`
            border-bottom-color: ${theme.color.accent};
          `}
        `
      : css`
          padding: 9px 11px;
          background: ${theme.color.bg};
          border: 1px solid ${theme.color.border};
          border-radius: ${theme.radius.sm};
          font-size: 13px;
          font-weight: 500;

          &:hover {
            border-color: ${theme.color.accent};
          }

          &:focus-visible {
            ${triggerActive}
          }

          ${$open && triggerActive}
        `}
`;

export const DropdownValue = styled.span<{ $placeholder?: boolean }>`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  color: ${({ $placeholder, theme }) =>
    $placeholder ? theme.color.placeholder : "inherit"};
`;

// Portalled to <body>, so this must be a standalone styled component.
export const DropdownMenu = styled.ul`
  position: fixed;
  z-index: 5000;
  margin: 0;
  padding: 5px;
  list-style: none;
  max-height: 280px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: 0 18px 50px ${({ theme }) => theme.color.shadow};
  animation: dropdown-in 0.12s ease;
  scrollbar-width: thin;

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
