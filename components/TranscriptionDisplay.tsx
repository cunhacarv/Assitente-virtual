import React from 'react';
import { TranscriptionEntry } from '../types';
import CodeBlock from './CodeBlock';

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
);

interface TranscriptionDisplayProps {
  history: TranscriptionEntry[];
  currentUserTranscription: string;
  currentAssistantTranscription: string;
  onDownloadResponse: (entry: TranscriptionEntry) => void;
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  history,
  currentUserTranscription,
  currentAssistantTranscription,
  onDownloadResponse,
}) => {
  return (
    <div className="w-full max-w-4xl h-64 p-4 bg-gray-800/50 rounded-lg overflow-y-auto space-y-4 font-mono text-sm md:text-base">
      {history.map((entry, index) => (
        <div key={index} className="space-y-2">
          {entry.user && <p><span className="text-cyan-400 font-bold">Você:</span> {entry.user}</p>}
          {(entry.assistant || entry.code) && (
            <div className="relative group pr-8">
              <div className="text-left">
                {entry.assistant && <p><span className="text-green-400 font-bold">Assistente:</span> {entry.assistant}</p>}
                {entry.code && <CodeBlock language={entry.code.language} content={entry.code.content} />}
              </div>
              <button 
                onClick={() => onDownloadResponse(entry)}
                className="absolute top-0 right-0 p-1.5 bg-gray-700/50 rounded-full text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600 hover:text-white"
                title="Baixar esta resposta em PDF"
              >
                <DownloadIcon />
              </button>
            </div>
          )}
        </div>
      ))}
      {(currentUserTranscription || currentAssistantTranscription) && (
        <div className="space-y-2">
          {currentUserTranscription && <p className="opacity-70"><span className="text-cyan-400 font-bold">Você:</span> {currentUserTranscription}</p>}
          {currentAssistantTranscription && <p className="opacity-70"><span className="text-green-400 font-bold">Assistente:</span> {currentAssistantTranscription}</p>}
        </div>
      )}
    </div>
  );
};

export default TranscriptionDisplay;