import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { solarizedlight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './MarkdownRenderer.css';

const MarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        // Code blocks with syntax highlighting
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter
              style={solarizedlight}
              language={match[1]}
              PreTag="div"
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        // Tables with custom styling
        table({ children, ...props }) {
          return (
            <div className="markdown-table-wrapper">
              <table className="markdown-table" {...props}>
                {children}
              </table>
            </div>
          );
        },
        // Table headers
        thead({ children, ...props }) {
          return <thead className="markdown-thead" {...props}>{children}</thead>;
        },
        // Table rows
        tr({ children, ...props }) {
          return <tr className="markdown-tr" {...props}>{children}</tr>;
        },
        // Table cells
        td({ children, ...props }) {
          return <td className="markdown-td" {...props}>{children}</td>;
        },
        th({ children, ...props }) {
          return <th className="markdown-th" {...props}>{children}</th>;
        },
        // Horizontal rules (---)
        hr({ ...props }) {
          return <hr className="markdown-hr" {...props} />;
        },
        // Headings with emoji support
        h1({ children, ...props }) {
          return <h1 className="markdown-h1" {...props}>{children}</h1>;
        },
        h2({ children, ...props }) {
          return <h2 className="markdown-h2" {...props}>{children}</h2>;
        },
        h3({ children, ...props }) {
          return <h3 className="markdown-h3" {...props}>{children}</h3>;
        },
        // Lists
        ul({ children, ...props }) {
          return <ul className="markdown-ul" {...props}>{children}</ul>;
        },
        ol({ children, ...props }) {
          return <ol className="markdown-ol" {...props}>{children}</ol>;
        },
        li({ children, ...props }) {
          return <li className="markdown-li" {...props}>{children}</li>;
        },
        // Paragraphs
        p({ children, ...props }) {
          return <p className="markdown-p" {...props}>{children}</p>;
        },
        // Blockquotes
        blockquote({ children, ...props }) {
          return <blockquote className="markdown-blockquote" {...props}>{children}</blockquote>;
        },
        // Strong/Bold
        strong({ children, ...props }) {
          return <strong className="markdown-strong" {...props}>{children}</strong>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MarkdownRenderer;
