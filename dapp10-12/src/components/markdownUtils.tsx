import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { solarizedlight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export const parseMarkdown = async (content: string): Promise<string> => {
  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['pre', 'code', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'img', 'table', 'tr', 'th', 'td', 'script','ul'],
    ALLOWED_ATTR: ['class', 'src', 'alt', 'href', 'title'],
  });

  const processedContent = sanitizedContent.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = (SyntaxHighlighter as any).supportedLanguages?.includes(lang) ? lang : 'text';
    return renderToStaticMarkup(
      <SyntaxHighlighter language={language} style={solarizedlight as any}>
        {code.trim()}
      </SyntaxHighlighter>
    );
  });

  const renderer: any = {
    link(href: string, title: string | null, text: string): string {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href=" "${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a >`;
    },
    image(href: string, title: string | null, text: string): string {
      const titleAttr = title ? ` title="${title}"` : '';
      return `< img src="${href}" alt="${text}"${titleAttr} style="max-width: 100%; height: auto;">`;
    },
  };

  marked.use({ renderer });

  const parsedContent = marked(processedContent, {
    breaks: true,
    gfm: true,
  });

  return parsedContent;
};

export const extractCodeBlocks = (content: string): { language: string; code: string }[] => {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const codeBlocks = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
    });
  }

  return codeBlocks;
};

export const highlightCode = (code: string, language: string): string => {
  return renderToStaticMarkup(
    <SyntaxHighlighter language={language} style={solarizedlight as any}>
      {code}
    </SyntaxHighlighter>
  );
};
