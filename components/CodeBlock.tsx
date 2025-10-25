import React, { useState } from 'react';

interface CodeBlockProps {
  language: string;
  content: string;
}

const fileExtensions: { [key: string]: string } = {
  javascript: 'js',
  python: 'py',
  typescript: 'ts',
  html: 'html',
  css: 'css',
  java: 'java',
  csharp: 'cs',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  shell: 'sh',
  json: 'json',
  yaml: 'yaml',
  markdown: 'md',
};

const CodeBlock: React.FC<CodeBlockProps> = ({ language, content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const extension = fileExtensions[language.toLowerCase()] || 'txt';
    const filename = `codigo.${extension}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-gray-950 rounded-lg my-4 overflow-hidden border border-gray-700">
      <div className="flex justify-between items-center px-4 py-2 bg-gray-800 text-xs text-gray-400">
        <span>{language}</span>
        <div className="flex items-center space-x-2">
          <button onClick={handleCopy} className="flex items-center space-x-1 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>
          <button onClick={handleDownload} className="flex items-center space-x-1 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <span>Download</span>
          </button>
        </div>
      </div>
      <pre className="p-4 overflow-x-auto"><code className={`language-${language}`}>{content}</code></pre>
    </div>
  );
};

export default CodeBlock;