
import React from 'react';
import { AssistantStatus } from '../types';

interface VirtualAssistantAvatarProps {
  status: AssistantStatus;
}

const VirtualAssistantAvatar: React.FC<VirtualAssistantAvatarProps> = ({ status }) => {
  const getStatusClasses = () => {
    switch (status) {
      case AssistantStatus.LISTENING:
        return {
          glow: 'animate-pulse fill-cyan-400/30',
          eyes: 'fill-cyan-400',
          mouth: 'M 100 150 Q 150 160 200 150',
        };
      case AssistantStatus.THINKING:
        return {
          glow: 'animate-spin fill-purple-400/30',
          eyes: 'fill-purple-400',
          mouth: 'M 100 150 L 200 150',
        };
      case AssistantStatus.SPEAKING:
        return {
          glow: 'animate-pulse fill-green-400/40',
          eyes: 'fill-green-400',
          mouth: 'M 100 150 Q 150 180 200 150',
        };
      case AssistantStatus.IDLE:
      default:
        return {
          glow: 'fill-gray-600/20',
          eyes: 'fill-gray-400',
          mouth: 'M 100 150 L 200 150',
        };
    }
  };

  const { glow, eyes, mouth } = getStatusClasses();

  return (
    <div className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center">
      <svg viewBox="0 0 300 300" className="w-full h-full">
        <circle cx="150" cy="150" r="150" className={`transition-all duration-300 ${glow}`} />
        <circle cx="150" cy="150" r="120" className="fill-gray-800" />
        <circle cx="110" cy="110" r="15" className={`transition-all duration-300 ${eyes}`} />
        <circle cx="190" cy="110" r="15" className={`transition-all duration-300 ${eyes}`} />
        <path d={mouth} className="stroke-gray-400 stroke-2 fill-transparent transition-all duration-200" style={{ strokeWidth: 5, strokeLinecap: 'round' }} />
      </svg>
    </div>
  );
};

export default VirtualAssistantAvatar;
