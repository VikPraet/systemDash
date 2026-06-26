import styled from "styled-components";

export const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.color.hairline};
`;

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
`;

export const Summary = styled.div`
  min-width: 100px;
`;

export const Label = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.color.muted};
  margin-bottom: 4px;
`;

export const Value = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`;

export const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.warn};
`;

export const Muted = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
`;

export const ErrorText = styled.p`
  margin: 0 0 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.color.bad};
`;

export const PackageList = styled.ul`
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.muted};
  max-height: 120px;
  overflow: auto;
`;

export const Output = styled.pre`
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.hairline};
  font-size: 11px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;
