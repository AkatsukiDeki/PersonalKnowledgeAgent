import React from 'react';
import { ChatMode } from '../../types/chat';
import { Zap, Database, GraduationCap, Sparkles, X } from 'lucide-react';

interface ChatModeSelectorProps {
  value: ChatMode;
  onChange: (mode: ChatMode) => void;
  learningSubject?: string;
  onClearSubject?: () => void;
}

export const ChatModeSelector: React.FC<ChatModeSelectorProps> = ({ 
  value, 
  onChange, 
  learningSubject,
  onClearSubject
}) => {
  const modes: { id: ChatMode; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'fast', label: 'Fast', icon: <Zap className="w-3.5 h-3.5" />, color: 'text-amber-400' },
    { id: 'vault', label: 'Vault', icon: <Database className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
    { id: 'learning', label: 'Learning', icon: <GraduationCap className="w-3.5 h-3.5" />, color: 'text-blue-400' },
    { id: 'reasoning', label: 'Reasoning', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'text-purple-400' },
  ];

  return (
    <div className="flex items-center gap-1.5 p-1 bg-zinc-900/50 border border-zinc-800 rounded-lg backdrop-blur-sm self-start mb-2">
      {modes.map((m) => {
        const isActive = value === m.id;
        const isLearningActive = isActive && m.id === 'learning' && learningSubject;

        return (
          <div key={m.id} className="relative group flex">
            <button
              type="button"
              onClick={() => onChange(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              <span className={isActive ? m.color : 'text-zinc-500'}>
                {m.icon}
              </span>
              <span>{isLearningActive ? `Tutor: ${learningSubject}` : m.label}</span>
            </button>
            {isLearningActive && onClearSubject && (
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSubject();
                }}
                className="absolute -top-1 -right-1 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm"
                title="Clear active subject"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
