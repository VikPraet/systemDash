import styled from "styled-components";
import { mobile } from "../../theme/media";
import { ModalCard, ModalOverlay } from "./styles";

export const EditorOverlay = styled(ModalOverlay)`
  z-index: 6200;
`;

export const EditorCard = styled(ModalCard)`
  max-width: min(760px, 100%);
  max-height: min(92vh, 900px);
  min-height: 0;
  overflow: hidden;
  gap: 12px;

  @media ${mobile} {
    max-height: min(92dvh, 900px);
  }
`;

export const Hint = styled.p`
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
`;

export const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;

  @media ${mobile} {
    grid-template-columns: 1fr;
  }
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.color.text};

  > span:first-child {
    font-size: 11px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const TextInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: 0;
  color: ${({ theme }) => theme.color.text};
  padding: 7px 2px;
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
  outline: none;

  &:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }

  &:disabled {
    opacity: 0.55;
  }
`;

export const ColorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const ColorSwatch = styled.input`
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.panel2};
  cursor: pointer;
  flex-shrink: 0;

  &::-webkit-color-swatch-wrapper {
    padding: 2px;
  }
  &::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
`;

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

export const Seg = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  overflow: hidden;

  button {
    appearance: none;
    margin: 0;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.color.muted};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    cursor: pointer;
  }

  button.active {
    background: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
  }
`;

export const Scroll = styled.div`
  overflow: auto;
  min-height: 0;
  flex: 1;
  padding-right: 4px;
`;

export const SectionLabel = styled.div`
  margin: 12px 0 8px;
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const EffectsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  @media ${mobile} {
    grid-template-columns: 1fr;
  }
`;

export const ColorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;

  @media ${mobile} {
    grid-template-columns: 1fr;
  }
`;
