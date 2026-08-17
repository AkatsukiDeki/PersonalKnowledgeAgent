import React, { useEffect, useState } from 'react';
import { Pattern, patternsApi } from '../../api/patterns';
import { Brain, Activity, Lightbulb, Blocks, RefreshCw } from 'lucide-react';

interface PatternDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const getPatternIcon = (type: string) => {
  switch (type) {
    case 'behavioral': return <Activity className="w-5 h-5 text-blue-400" />;
    case 'cognitive': return <Brain className="w-5 h-5 text-purple-400" />;
    case 'productivity': return <Lightbulb className="w-5 h-5 text-emerald-400" />;
    case 'architectural': return <Blocks className="w-5 h-5 text-orange-400" />;
    default: return <Brain className="w-5 h-5 text-zinc-400" />;
  }
};

const getPatternColor = (type: string) => {
  switch (type) {
    case 'behavioral': return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
    case 'cognitive': return 'border-purple-500/30 bg-purple-500/10 text-purple-200';
    case 'productivity': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    case 'architectural': return 'border-orange-500/30 bg-orange-500/10 text-orange-200';
    default: return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-200';
  }
};

export function PatternDashboard({ isOpen, onClose }: PatternDashboardProps) {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchPatterns = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await patternsApi.getPatterns();
      setPatterns(data);
    } catch (e: any) {
      setError(e.message || "Failed to load patterns");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPatterns();
    }
  }, [isOpen]);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setError(null);
    try {
      const newPatterns = await patternsApi.discoverPatterns();
      setPatterns(prev => [...newPatterns, ...prev]);
    } catch (e: any) {
      setError(e.message || "Discovery failed");
    } finally {
      setIsDiscovering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              Cross-Domain Insights
            </h2>
            <p className="text-xs text-zinc-400 mt-1">Discover high-level patterns across your knowledge base.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDiscover}
              disabled={isDiscovering}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isDiscovering ? 'animate-spin text-purple-400' : 'text-zinc-400'}`} />
              Discover Patterns
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-10">
              <RefreshCw className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : patterns.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">
              No patterns discovered yet. Click 'Discover Patterns' to analyze your knowledge base.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {patterns.map((p) => {
                const isExpanded = expandedId === p.id;
                return (
                  <div key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors">
                    <div 
                      className="flex items-start gap-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    >
                      <div className={`p-2 rounded-lg border ${getPatternColor(p.pattern_type)}`}>
                        {getPatternIcon(p.pattern_type)}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <h3 className="text-zinc-100 font-medium text-sm leading-snug">{p.title}</h3>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                              Conf: {Math.round(p.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-xs text-zinc-400 mt-1.5">{p.description}</p>
                        
                        <div className="flex items-center gap-2 mt-3">
                          {p.domains.map((d, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] text-zinc-300 capitalize border border-zinc-700">
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-zinc-800/50 pl-14">
                        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">Evidence Summary</h4>
                        <p className="text-sm text-zinc-400 italic bg-zinc-950/30 p-3 rounded-md border border-zinc-800/30">
                          "{p.evidence_summary}"
                        </p>
                        
                        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mt-4 mb-2">Source Claims</h4>
                        <div className="flex flex-col gap-2">
                          {p.evidence_claim_ids.map((id, i) => (
                            <div key={i} className="text-xs text-zinc-500 font-mono flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-zinc-700" />
                              {id}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
