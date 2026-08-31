import React from 'react';
import { PanelRightClose, Orbit, Sparkles, GitBranch, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { OrbitContext, Decision, Citation } from '../../types/chat';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  context: OrbitContext | null;
}

export function MemoryOrbit({ isOpen, onClose, context }: Props) {
  if (!isOpen) return null;

  const decisions = context?.decisions || [];
  const evidences = context?.evidences || [];
  const insights = context?.insights || [];

  return (
    <>
      {/* Mobile backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] sm:hidden transition-opacity"
        onClick={onClose}
      />
      
      {/* MemoryOrbit container */}
      <div className="fixed sm:static top-0 right-0 h-full z-[100] sm:z-auto w-full sm:w-auto pointer-events-none">
        <aside className="pointer-events-auto h-full w-full sm:w-80 md:w-96 max-w-full bg-[#0a0a0a]/95 backdrop-blur-3xl border-l border-white/5 flex flex-col shrink-0 overflow-hidden text-slate-200 shadow-2xl ml-auto">
          {/* Header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-white/5 bg-white/[0.02] shrink-0">
            <div className="flex items-center gap-2">
              <Orbit size={14} className="text-indigo-400" />
              <span className="text-[11px] font-mono tracking-widest text-white/80 uppercase">
                Memory Orbit
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
              title="Close Orbit"
            >
              <PanelRightClose size={15} strokeWidth={1.5} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-8">
            {/* Active Decisions */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <GitBranch size={13} className="text-indigo-400" />
                <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Decisions</span>
                <span className="text-[10px] font-mono text-white/30 ml-auto">({decisions.length})</span>
              </div>
              {decisions.length > 0 ? (
                <div className="space-y-2">
                  {decisions.map((d) => (
                    <DecisionCard key={d.id} decision={d} />
                  ))}
                </div>
              ) : (
                <EmptyBlock text="No active decisions in context" />
              )}
            </div>

            {/* Evidences */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={13} className="text-amber-400" />
                <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Evidences</span>
                <span className="text-[10px] font-mono text-white/30 ml-auto">({evidences.length})</span>
              </div>
              {evidences.length > 0 ? (
                <div className="space-y-2">
                  {evidences.slice(0, 5).map((c, i) => (
                    <EvidenceCard key={i} citation={c} />
                  ))}
                  {evidences.length > 5 && (
                    <p className="text-[10px] font-mono text-white/30 text-center py-1">+{evidences.length - 5} more</p>
                  )}
                </div>
              ) : (
                <EmptyBlock text="Sources will appear during agent response" />
              )}
            </div>

            {/* Related Insights */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={13} className="text-fuchsia-400" />
                <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Related Insights</span>
                <span className="text-[10px] font-mono text-white/30 ml-auto">({insights.length})</span>
              </div>
              {insights.length > 0 ? (
                <div className="space-y-2">
                  {insights.map((ins) => (
                    <div
                      key={ins.id}
                      className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:bg-white/[0.05] transition-colors"
                    >
                      <p className="text-xs text-white/90 font-medium leading-snug">{ins.title}</p>
                      {ins.domain && (
                        <span className="text-[10px] font-mono text-fuchsia-400/70 mt-1 block uppercase tracking-wider">{ins.domain}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock text="No related insights found" />
              )}
            </div>
          </div>

          {/* Footer hint */}
          <div className="p-3 border-t border-white/5 bg-black/40 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0">
            <p className="text-[10px] font-mono text-white/30 text-center leading-relaxed">
              Runtime memory context stream
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

/* ── Sub-components ── */

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
      <p className="text-xs text-white/30 text-center font-light italic">{text}</p>
    </div>
  );
}

function DecisionCard({ decision }: { decision: Decision }) {
  const isActive = decision.status === 'active';
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:bg-white/[0.05] transition-colors">
      <div className="flex items-start gap-2.5">
        {isActive ? (
          <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
        ) : (
          <XCircle size={14} className="text-white/20 mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <p className={`text-xs font-medium leading-snug ${isActive ? 'text-white/90' : 'text-white/30 line-through'}`}>
            {decision.decision}
          </p>
          {decision.rationale && (
            <p className="text-[11px] text-white/40 mt-1 font-light italic truncate">
              "{decision.rationale}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceCard({ citation }: { citation: Citation }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:bg-white/[0.05] transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-emerald-400/90 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          {citation.score.toFixed(3)}
        </span>
        <span className="text-[10px] font-mono text-white/30 truncate">
          {citation.source_id?.slice(0, 8)}…
        </span>
      </div>
      <p className="text-xs text-white/60 leading-relaxed line-clamp-3 font-light">
        {citation.text_snippet}
      </p>
    </div>
  );
}

export default MemoryOrbit;