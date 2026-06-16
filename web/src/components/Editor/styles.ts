import styled from "styled-components";

export const EditorOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 110;
  padding: 28px;
  animation: modal-fade 0.12s ease;
`;

export const EditorPanel = styled.div`
  width: 100%;
  max-width: 1000px;
  height: 100%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
`;

export const EditorHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
`;

export const EditorTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

export const EditorName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`;

export const EditorDirty = styled.span`
  color: ${({ theme }) => theme.color.accent};
`;

export const EditorPath = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const EditorActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

export const EditorSaved = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
`;

export const EditorError = styled.div`
  padding: 8px 16px;
  background: color-mix(in srgb, ${({ theme }) => theme.color.bad} 14%, transparent);
  border-bottom: 1px solid
    color-mix(in srgb, ${({ theme }) => theme.color.bad} 45%, transparent);
  color: ${({ theme }) => theme.color.bad};
  font-size: 12px;
  flex-shrink: 0;
`;

export const EditorArea = styled.textarea`
  flex: 1;
  min-height: 0;
  resize: none;
  border: none;
  outline: none;
  background: #0b0e14;
  color: ${({ theme }) => theme.color.text};
  padding: 14px 16px;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 13px;
  line-height: 1.55;
  tab-size: 4;
  white-space: pre;
  overflow: auto;
`;

export const EditorMessage = styled.div`
  padding: 40px;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};
`;
