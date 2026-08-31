import React from 'react';
import { AdaptiveRoadmapPayload, RoadmapModule, RoadmapSubtopic } from '../../api/learning';
import { FileText, Link as LinkIcon, BookOpen, AlertCircle, ChevronDown, CheckCircle2 } from 'lucide-react';

interface RoadmapExplorerProps {
  roadmap: AdaptiveRoadmapPayload | null;
  selectedTopicId: string | null;
  onTopicSelect: (module: RoadmapModule, topic: RoadmapSubtopic) => void;
  isGeneratingNote: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  fundamentals: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  core: 'bg-green-500/10 text-green-400 border-green-500/30',
  advanced: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  troubleshooting: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
};

export function RoadmapExplorer({ roadmap, selectedTopicId, onTopicSelect, isGeneratingNote }: RoadmapExplorerProps) {
  if (!roadmap) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 p-6 text-center border border-white/5 rounded-xl bg-zinc-900/20">
        <BookOpen size={48} className="mb-4 opacity-50" />
        <p className="text-sm">Сгенерируйте дорожную карту для начала обучения</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-900/40 rounded-xl border border-white/10 overflow-hidden">
      <div className="p-4 border-b border-white/10 shrink-0 bg-white/5">
        <h2 className="text-lg font-bold text-zinc-100">{roadmap.title}</h2>
        {roadmap.target_role && (
          <div className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-indigo-400"/> {roadmap.target_role}
          </div>
        )}
        <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{roadmap.overview}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-24 space-y-4">
        {roadmap.modules.map((mod, idx) => (
          <div key={mod.id} className="bg-white/5 rounded-lg border border-white/5 overflow-hidden">
            <div className="p-3 border-b border-white/5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-200">
                  <span className="text-zinc-500 mr-2">{idx + 1}.</span>
                  {mod.title}
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap uppercase tracking-wider ${LEVEL_COLORS[mod.level] || LEVEL_COLORS.fundamentals}`}>
                  {mod.level}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">{mod.description}</p>
            </div>
            
            <div className="p-2 space-y-1">
              {mod.topics.map((topic, tIdx) => {
                const isActive = selectedTopicId === topic.id;
                const totalClaims = topic.evidence.reduce((acc, ev) => acc + ev.claim_ids.length, 0);
                const totalChunks = topic.evidence.reduce((acc, ev) => acc + ev.chunk_ids.length, 0);
                
                return (
                  <button
                    key={topic.id}
                    onClick={() => onTopicSelect(mod, topic)}
                    disabled={isGeneratingNote && !isActive}
                    className={`w-full text-left p-2.5 rounded-md transition border flex flex-col gap-1
                      ${isActive 
                        ? 'bg-indigo-500/10 border-indigo-500/50 shadow-sm' 
                        : 'border-transparent hover:bg-white/5 hover:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed'
                      }
                    `}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`}>
                        {isActive && isGeneratingNote ? (
                          <div className="w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        ) : (
                          <FileText size={14} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={`text-sm truncate ${isActive ? 'text-indigo-100 font-medium' : 'text-zinc-300'}`}>
                          {topic.title}
                        </h4>
                        <div className="flex items-center gap-3 mt-1.5 opacity-80">
                          {(totalClaims > 0 || totalChunks > 0) && (
                            <span className="text-[10px] flex items-center gap-1 text-emerald-400/80">
                              <BookOpen size={10} /> {totalClaims + totalChunks} первоисточников
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
