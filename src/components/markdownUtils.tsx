import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { downloadFile } from '../services/api';

  const handleDownload = async (filename: any[] = []) => {
    console.log(filename)
      try {
        const response = await downloadFile(filename);
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename[0].name);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (error) {
        console.error('Download failed:', error);
      }
  };

export const parseMarkdown = async (content: string): Promise<string> => {
  // Coerce to string if needed (e.g., objects)
  const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  
  // Normalize newlines
  let normalized = (raw || '').replace(/\r\n?/g, '\n');

  // Auto-close unmatched triple backticks
  const fenceCount = (normalized.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    normalized += '\n```';
  }

  const sanitizedContent = DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS: ['pre', 'code', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'img', 'table', 'tr', 'th', 'td', 'ul'],
    ALLOWED_ATTR: ['class', 'src', 'alt', 'href', 'title'],
  });
  
  // Accept languages like c++, c#, tsx, json5
  const fenceRegex = /```([\w#+-]+)?\s*([\s\S]*?)```/g;
  const tildeFenceRegex = /~~~([\w#+-]+)?\s*([\s\S]*?)~~~/g;

  const replaceWithHighlighted = (match: string, lang: string, code: string) => {
    const language = lang || 'text';
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const highlightedCode = `
      <pre class="code-highlight">
        <code class="language-${language}">${escaped.trim()}</code>
      </pre>
    `;
    return highlightedCode;
  };

  let processedContent = sanitizedContent.replace(fenceRegex, replaceWithHighlighted);
  processedContent = processedContent.replace(tildeFenceRegex, replaceWithHighlighted);

  const parsedContent = marked(processedContent, {
    breaks: true,
    gfm: true,
  });

  return parsedContent;
};

export const extractCodeBlocks = (content: string): { language: string; code: string }[] => {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const codeBlocks = [] as { language: string; code: string }[];
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
    });
  }

  return codeBlocks;
};

export const highlightCode = (code: string, language: string): string => {
  return `
    <pre class="code-highlight">
      <code class="language-${language}">${code}</code>
    </pre>
  `;
};
