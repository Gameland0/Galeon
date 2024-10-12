import React, { useState, useEffect, useContext } from 'react';
import { Message } from './ChatContext';
import { renderMessage } from './messageUtils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { solarizedlight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import copy from 'clipboard-copy';

interface AsyncMessageProps {
  msg: Message;
  index: number;
}

export const AsyncMessage: React.FC<AsyncMessageProps> = React.memo(({ msg, index }) => {
  const [renderedMessage, setRenderedMessage] = useState<JSX.Element | null>(null);

  const CodeBlockWithCopyButton: React.FC<{ code: string; language: string }> = ({ code, language }) => {
    const [isCopied, setIsCopied] = useState(false);
  
    const handleCopy = async () => {
      console.log('handleCopy')
      await copy(code);
      console.log('code:',code)
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    };
  
    return (
      <div className="code-block-wrapper">
        <SyntaxHighlighter language={language} style={solarizedlight}>
          {code}
        </SyntaxHighlighter>
        <button className="copy-button" onClick={handleCopy}>
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    );
  };

  useEffect(() => {
    const render = async () => {
      const rendered = await renderMessage(msg, index);
      setRenderedMessage(rendered);
    };
    render();
  }, [msg, index]);

  if (!renderedMessage) {
    return null;
  }

  return (
    <>
      {renderedMessage}
    </>
  );
});
