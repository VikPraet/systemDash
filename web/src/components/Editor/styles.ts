import styled from "styled-components";
import { ModalOverlay } from "../ui/styles";

export const EditorOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.color.overlay};
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
  border-radius: ${({ theme }) => theme.radius};
  overflow: hidden;
  box-shadow: 0 18px 50px ${({ theme }) => theme.color.shadow};
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

export const EditorNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

export const EditorLang = styled.span`
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
  padding: 2px 6px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const EditorMode = styled.span<{ $view: boolean }>`
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ $view, theme }) => ($view ? theme.color.muted : theme.color.accent)};
  padding: 2px 6px;
  border: 1px solid
    ${({ $view, theme }) =>
      $view ? theme.color.border : `color-mix(in srgb, ${theme.color.accent} 45%, transparent)`};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ $view, theme }) =>
    $view ? "transparent" : `color-mix(in srgb, ${theme.color.accent} 10%, transparent)`};
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

export const EditorBody = styled.div<{ $readOnly?: boolean }>`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${({ theme }) => theme.color.panel2};
  border-top: 1px solid ${({ theme }) => theme.color.border};

  /* @uiw/react-codemirror root wrapper */
  & > div {
    flex: 1;
    min-height: 0;
    height: 100%;
  }

  .cm-editor {
    height: 100%;
  }

  .cm-editor.cm-focused {
    outline: none;
  }

  ${({ $readOnly }) =>
    $readOnly &&
    `
    .cm-cursor {
      display: none !important;
    }

    .cm-content {
      caret-color: transparent;
    }
  `}
`;

export const EditorMessage = styled.div`
  padding: 40px;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};
`;

/** Sits above the editor overlay when confirming unsaved changes. */
export const EditorDiscardOverlay = styled(ModalOverlay)`
  z-index: 6300;
`;

export const MarkdownToggle = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  overflow: hidden;
  flex-shrink: 0;

  button {
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.color.muted};
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;

    &:hover:not(.active) {
      color: ${({ theme }) => theme.color.text};
      background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 8%, transparent);
    }

    &.active {
      color: ${({ theme }) => theme.color.accent};
      background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 14%, transparent);
    }

    & + button {
      border-left: 1px solid ${({ theme }) => theme.color.border};
    }
  }
`;

export const MarkdownPreviewPane = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px;
`;

export const MarkdownArticle = styled.article`
  max-width: 720px;
  margin: 0 auto;
  color: ${({ theme }) => theme.color.text};
  font-size: 14px;
  line-height: 1.65;

  :first-child {
    margin-top: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
    line-height: 1.3;
    margin: 1.4em 0 0.55em;
  }

  h1 {
    font-size: 1.75em;
    padding-bottom: 0.35em;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
  }

  h2 {
    font-size: 1.35em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid
      color-mix(in srgb, ${({ theme }) => theme.color.border} 70%, transparent);
  }

  h3 {
    font-size: 1.15em;
  }

  h4,
  h5,
  h6 {
    font-size: 1em;
    color: ${({ theme }) => theme.color.muted};
  }

  p,
  ul,
  ol,
  blockquote,
  pre,
  table {
    margin: 0 0 1em;
  }

  ul,
  ol {
    padding-left: 1.5em;
  }

  li + li {
    margin-top: 0.25em;
  }

  li > ul,
  li > ol {
    margin-top: 0.25em;
    margin-bottom: 0;
  }

  a {
    color: ${({ theme }) => theme.color.accent};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  strong {
    font-weight: 600;
    color: ${({ theme }) => theme.color.text};
  }

  em {
    font-style: italic;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    padding: 0.15em 0.4em;
    border-radius: ${({ theme }) => theme.radius.sm};
    background: ${({ theme }) => theme.color.panel};
    border: 1px solid ${({ theme }) => theme.color.border};
  }

  pre {
    padding: 14px 16px;
    border-radius: ${({ theme }) => theme.radius};
    background: ${({ theme }) => theme.color.panel};
    border: 1px solid ${({ theme }) => theme.color.border};
    overflow: auto;

    code {
      padding: 0;
      border: none;
      background: none;
      font-size: 13px;
      line-height: 1.55;
    }
  }

  blockquote {
    margin-left: 0;
    padding: 0.35em 0 0.35em 1em;
    border-left: 3px solid ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.muted};
  }

  hr {
    border: none;
    border-top: 1px solid ${({ theme }) => theme.color.border};
    margin: 1.5em 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th,
  td {
    padding: 8px 12px;
    border: 1px solid ${({ theme }) => theme.color.border};
    text-align: left;
  }

  th {
    background: ${({ theme }) => theme.color.panel};
    font-weight: 600;
  }

  tr:nth-child(even) td {
    background: color-mix(in srgb, ${({ theme }) => theme.color.panel} 50%, transparent);
  }

  img {
    max-width: 100%;
    border-radius: ${({ theme }) => theme.radius};
  }

  input[type="checkbox"] {
    margin-right: 0.45em;
    accent-color: ${({ theme }) => theme.color.accent};
  }
`;
