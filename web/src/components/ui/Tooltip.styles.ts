import styled from "styled-components";

export const TooltipWrap = styled.div`
  position: relative;
  display: inline-flex;
`;

export const TooltipBox = styled.div<{ $below?: boolean }>`
  position: fixed;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: max-content;
  max-width: min(320px, calc(100vw - 16px));
  padding: 8px 10px;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: 0 8px 24px ${({ theme }) => theme.color.shadow};
  pointer-events: none;
`;

export const TooltipTitle = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
`;

export const TooltipDetail = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  font-variant-numeric: tabular-nums;
`;

export const TooltipArrow = styled.span<{ $below?: boolean }>`
  position: absolute;
  left: 14px;
  width: 8px;
  height: 8px;
  background: ${({ theme }) => theme.color.panel2};
  transform: rotate(45deg);

  ${({ $below, theme }) =>
    $below
      ? `
    top: 0;
    border-left: 1px solid ${theme.color.border};
    border-top: 1px solid ${theme.color.border};
    transform: translateY(-50%) rotate(45deg);
  `
      : `
    bottom: 0;
    border-right: 1px solid ${theme.color.border};
    border-bottom: 1px solid ${theme.color.border};
    transform: translateY(50%) rotate(45deg);
  `}
`;
