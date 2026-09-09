import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as S from "./styles";

/** Markdown body with the shared article typography. Callers supply the box. */
export function Markdown({ content }: { content: string }) {
  return (
    <S.MarkdownArticle>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </S.MarkdownArticle>
  );
}

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <S.MarkdownPreviewPane>
      <Markdown content={content} />
    </S.MarkdownPreviewPane>
  );
}
