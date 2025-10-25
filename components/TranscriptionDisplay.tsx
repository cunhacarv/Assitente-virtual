
import React from 'react';
import { TranscriptionEntry } from '../types';

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
          {entry.assistant && <p><span className="text-green-400 font-bold">PyA:</span> {entry.assistant}</p>}
        </div>
      ))}
      {(currentUserTranscription || currentAssistantTranscription) && (
        <div className="space-y-2">
          {currentUserTranscription && <p className="opacity-70"><span className="text-cyan-400 font-bold">Você:</span> {currentUserTranscription}</p>}
          {currentAssistantTranscription && <p className="opacity-70"><span className="text-green-400 font-bold">PyA:</span> {currentAssistantTranscription}</p>}
        </div>
      )}
    </div>
  );
};

export default TranscriptionDisplay;
