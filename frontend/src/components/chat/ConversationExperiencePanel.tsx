import React from 'react';
import { ConversationMemory, Decision } from '../../types/chat';
import { Lightbulb, Target, AlertCircle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface PanelProps {
  memory?: ConversationMemory | null;
  decisions?: Decision[];
}

export const ConversationExperiencePanel: React.FC<PanelProps> = ({ memory, decisions = [] }) => {
  if (!memory && decisions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm p-6 text-center">
        Опыт для этой сессии еще не извлечен или недоступен.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent bg-zinc-900 border-l border-zinc-800 flex flex-col w-80 text-zinc-100">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/90 backdrop-blur sticky top-0 z-10">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-zinc-100">
          <Lightbulb size={16} className="text-yellow-500" />
          Синтезированный опыт
        </h2>
      </div>

      <div className="p-4 space-y-6">
        {/* Section 1: Memory */}
        {memory && (
          <div className="space-y-4">
            {memory.problem && (
              <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertCircle size={14} /> Problem
                </h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{memory.problem}</p>
              </div>
            )}
            
            {memory.attempts && memory.attempts.length > 0 && (
              <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-yellow-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <RefreshCw size={14} /> Attempts
                </h3>
                <ul className="list-disc pl-4 space-y-1">
                  {memory.attempts.map((attempt, idx) => (
                    <li key={idx} className="text-sm text-zinc-300">{attempt}</li>
                  ))}
                </ul>
              </div>
            )}

            {memory.outcome && (
              <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Target size={14} /> Outcome
                </h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{memory.outcome}</p>
              </div>
            )}
          </div>
        )}

        {/* Section 2: Decisions */}
        {decisions.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 px-1">
              Decisions & Alternatives
            </h3>
            <div className="space-y-3">
              {decisions.map(d => (
                <div key={d.id} className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2">
                    {d.status === 'active' ? (
                      <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-zinc-500 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${d.status === 'active' ? 'text-zinc-100' : 'text-zinc-400 line-through'}`}>
                        {d.decision}
                      </p>
                      {d.rationale && (
                        <p className="text-xs text-zinc-400 mt-1 italic leading-relaxed">
                          "{d.rationale}"
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {d.alternatives && d.alternatives.length > 0 && (
                    <div className="mt-3 bg-zinc-900/50 rounded p-2 text-xs">
                      <span className="text-zinc-500 font-medium block mb-1">Отвергнуто:</span>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {d.alternatives.map((alt, idx) => (
                          <li key={idx} className="text-zinc-400">{alt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
