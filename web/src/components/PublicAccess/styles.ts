import styled from "styled-components";
import { mobile } from "../../theme/media";

export const Root = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

export const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;

  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const LiveRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

  h3 {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const LiveMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
`;

export const TextBtn = styled.button`
  margin-left: auto;
  padding: 0;
  background: none;
  border: none;
  color: ${({ theme }) => theme.color.muted};
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.accent};
  }
`;

export const Hint = styled.p`
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
`;

export const StatusRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 14px;
  margin-bottom: 12px;
`;

export const StatusLabel = styled.span<{ $state?: "good" | "warn" | "bad" }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ $state, theme }) =>
    $state === "good"
      ? theme.color.good
      : $state === "bad"
        ? theme.color.bad
        : $state === "warn"
          ? theme.color.warn
          : theme.color.text};
`;

export const PublicLink = styled.a`
  color: ${({ theme }) => theme.color.accent};
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  word-break: break-all;

  &:hover {
    text-decoration: underline;
  }
`;

export const Warn = styled.p`
  margin: 0 0 12px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.warn};
  background: color-mix(in srgb, ${({ theme }) => theme.color.warn} 12%, transparent);
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.color.warn} 35%, transparent);
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const Notice = styled.p`
  margin: 0 0 12px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.text};
  background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 10%, transparent);
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.color.accent} 28%, transparent);
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const Form = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 12px;

  @media ${mobile} {
    flex-direction: column;
    align-items: stretch;
  }
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 180px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};

  input {
    padding: 9px 2px;
    background: transparent;
    border: none;
    border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
    border-radius: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    outline: none;
  }

  input:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }
`;

export const CheckRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;

  input {
    margin-top: 2px;
    accent-color: ${({ theme }) => theme.color.accent};
  }
`;

export const HostList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
`;

export const HostRow = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 7px 2px;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
  color: ${({ theme }) => theme.color.text};
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;

  span {
    color: ${({ theme }) => theme.color.muted};
    font-size: 11px;
    flex-shrink: 0;
  }

  ${({ $active, theme }) =>
    $active &&
    `
    color: ${theme.color.accent};
    font-weight: 600;
  `}

  &:hover {
    color: ${({ theme }) => theme.color.accent};
  }
`;
