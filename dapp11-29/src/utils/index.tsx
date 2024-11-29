import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { solarizedlight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { renderToStaticMarkup } from 'react-dom/server';

export const getAgentColor = (agentId: number) => {
    const hue = agentId * 137.508; // Use golden angle approximation
    return `hsl(${hue % 360}, 50%, 75%)`;
};

export const parseMarkdown = async (content: string): Promise<string> => {
  console.log("Original Markdown:", content);
  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['pre', 'code', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'img', 'table', 'tr', 'th', 'td'],
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

  const parsedContent = marked(processedContent, {
    breaks: true,
    gfm: true,
  });

  console.log("Parsed HTML:", parsedContent);
  return parsedContent;
};