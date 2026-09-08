import styled from "styled-components";
import { mobile } from "../../theme/media";

export const PowerRoot = styled.div`
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const PowerHead = styled.div`
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

export const PowerHint = styled.p`
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
`;

export const PowerActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  @media ${mobile} {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;

    button {
      width: 100%;
      justify-content: center;
    }
  }
`;

export const PowerScheduled = styled.div`
  margin-top: 10px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.warn};
  background: color-mix(in srgb, ${({ theme }) => theme.color.warn} 12%, transparent);
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.color.warn} 35%, transparent);
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const ConfirmField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
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
    letter-spacing: 0.5px;
    text-transform: uppercase;
    outline: none;
  }

  input:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }
`;
