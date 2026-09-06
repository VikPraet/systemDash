import styled from "styled-components";

export const Box = styled.div<{ $ok?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 12px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.text};
  background: ${({ $ok, theme }) =>
    $ok
      ? `color-mix(in srgb, ${theme.color.good} 10%, transparent)`
      : `color-mix(in srgb, ${theme.color.accent} 8%, transparent)`};
  border: 1px solid
    ${({ $ok, theme }) =>
      $ok
        ? `color-mix(in srgb, ${theme.color.good} 35%, transparent)`
        : `color-mix(in srgb, ${theme.color.accent} 28%, transparent)`};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const Title = styled.div`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const Text = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.muted};
`;

export const Row = styled.div`
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
`;

export const Label = styled.span`
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const Value = styled.code`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: ${({ theme }) => theme.color.text};
`;

export const CopyBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.text};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
  }
`;
