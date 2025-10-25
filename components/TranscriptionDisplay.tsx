import React from 'react';
import { TranscriptionEntry } from '../types';
import CodeBlock from './CodeBlock';

interface TranscriptionDisplayProps {
  history: TranscriptionEntry[];
  currentUserTranscription: string;
  currentAssistantTranscription: string;
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  history,
  currentUserTranscription,
  currentAssistantTranscription,
}) => {
  return (
    <div className="w-full max-w-4xl h-64 p-4 bg-gray-800/50 rounded-lg overflow-y-auto space-y-4 font-mono text-sm md:text-base">
      {history.map((entry, index) => (
        <div key={index} className="space-y-2">
          {entry.user && <p><span className="text-cyan-400 font-bold">Você:</span> {entry.user}</p>}
          <div className="text-left">
            {entry.assistant && <p><span className="text-green-400 font-bold">Assistente:</span> {entry.assistant}</p>}
            {entry.code && <CodeBlock language={entry.code.language} content={entry.code.content} />}
          </div>
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