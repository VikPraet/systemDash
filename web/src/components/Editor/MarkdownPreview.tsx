import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as S from "./styles";

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <S.MarkdownPreviewPane>
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
    </S.MarkdownPreviewPane>
  );
}
