import React, { useEffect, useState } from 'react';
import { InsightEvidenceResponse, insightsApi } from '../../api/insights';
import { X, Loader2, GitCommit, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  patternId: string | null;
  onClose: () => void;
}

export function EvidenceInspectorModal({ patternId, onClose }: Props) {
  const [evidenceData, setEvidenceData] = useState<InsightEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!patternId) return;
    setLoading(true);
    insightsApi.getInsightEvidence(patternId)
      .then(res => setEvidenceData(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [patternId]);

  if (!patternId) return null;

  const toggleChunk = (id: string) => {
    setExpandedChunks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Search size={16} />
            </div>
            <div>
              <h2 className="text-zinc-100 font-semibold leading-tight">Доказательная база</h2>
              {evidenceData && (
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">{evidenceData.title}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-zinc-500 gap-3">
              <Loader2 size={20} className="animate-spin" /> Загрузка графа...
            </div>
          ) : evidenceData?.evidence.length === 0 ? (
            <div className="text-center text-zinc-500 py-10">
              Доказательства не найдены
            </div>
          ) : (
            <div className="relative before:absolute before:inset-y-0 before:left-[19px] before:w-[2px] before:bg-zinc-800 pl-2">
              {evidenceData?.evidence.map((ev, i) => {
                const isExpanded = expandedChunks[ev.claim_id];
                return (
                  <div key={ev.claim_id} className="relative mb-6 last:mb-0 group">
                    {/* Node Dot */}
                    <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-zinc-900 border-2 border-zinc-700 flex items-center justify-center z-10 group-hover:border-indigo-500 transition-colors">
                      <GitCommit size={12} className="text-zinc-500 group-hover:text-indigo-400" />
                    </div>
                    
                    <div className="ml-10">
                      <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded text-[10px] uppercase font-bold tracking-wider">
                            {ev.kind}
                          </span>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                            Source: {ev.source_title}
                          </span>
                        </div>
                        <p className="text-zinc-200 text-sm font-medium leading-relaxed">
                          {ev.claim_text}
                        </p>

                        <button 
                          onClick={() => toggleChunk(ev.claim_id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-400 mt-3 font-medium transition-colors"
                        >
                          <FileText size={14} />
                          {isExpanded ? 'Скрыть исходный текст' : 'Показать исходный текст'}
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {isExpanded && (
                          <div className="mt-3 p-3 bg-zinc-950 rounded-md border border-zinc-800 text-zinc-400 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                            {ev.chunk_text}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Just to keep icons working if Search wasn't imported from lucide-react above
import { Search } from 'lucide-react';
