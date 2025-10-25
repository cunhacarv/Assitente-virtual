import React, { useState, KeyboardEvent } from 'react';

interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled: boolean;
}

const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 p-1" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
    </svg>
);


const TextInput: React.FC<TextInputProps> = ({ onSubmit, disabled }) => {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (text.trim() && !disabled) {
      onSubmit(text.trim());
      setText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full max-w-4xl">
        <div className="relative flex items-center">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={disabled ? "Uma conversa de voz está em andamento..." : "Digite sua pergunta aqui ou use o microfone..."}
                rows={1}
                style={{ maxHeight: '100px', height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
                className="w-full p-4 pr-14 bg-gray-800/50 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
            <button
                onClick={handleSubmit}
                disabled={disabled || !text.trim()}
                className="absolute right-3 p-2 rounded-full bg-cyan-500 text-white hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                aria-label="Enviar mensagem"
            >
                <SendIcon />
            </button>
        </div>
    </div>
  );
};

export default TextInput;
