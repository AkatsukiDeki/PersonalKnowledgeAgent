import React from 'react';
import { Insight } from '../../api/insights';
import { Check, X, Search, Sparkles } from 'lucide-react';

interface Props {
  insight: Insight;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onInspect: (id: string) => void;
}

export function InsightCard({ insight, onAccept, onDismiss, onInspect }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-lg hover:border-zinc-700 transition-colors">
      <div className="flex justify-between items-start">
        <div className="flex gap-3 items-center">
          <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 text-indigo-400">
            <Sparkles size={16} />
          </div>
          <h3 className="text-zinc-100 font-semibold text-sm leading-tight">
            {insight.title}
          </h3>
        </div>
      </div>

      <p className="text-zinc-400 text-sm leading-relaxed">
        {insight.description}
      </p>

      <div className="flex flex-wrap gap-2">
        {(insight.domains ?? []).map((d, i) => (
          <span key={i} className="px-2 py-0.5 bg-zinc-800/50 text-zinc-300 rounded text-[10px] uppercase font-bold tracking-wider">
            {d}
          </span>
        ))}
        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[10px] uppercase font-bold tracking-wider border border-emerald-500/20">
          Conf: {(insight.confidence * 100).toFixed(0)}%
        </span>
        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px] uppercase font-bold tracking-wider border border-amber-500/20">
          Imp: {(insight.importance * 100).toFixed(0)}%
        </span>
        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] uppercase font-bold tracking-wider border border-blue-500/20">
          Evidences: {insight.evidence_claim_ids?.length ?? 0}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-2 border-t border-zinc-800/80 pt-4">
        <button
          onClick={() => onAccept(insight.id)}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2 text-xs font-medium transition-colors"
        >
          <Check size={16} /> Принять
        </button>
        <button
          onClick={() => onDismiss(insight.id)}
          className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 px-4 text-xs font-medium transition-colors"
        >
          <X size={16} /> Отклонить
        </button>
        <button
          onClick={() => onInspect(insight.id)}
          className="flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-lg py-2 px-4 text-xs font-medium transition-colors"
          title="Изучить доказательства"
        >
          <Search size={16} />
        </button>
      </div>
    </div>
  );
}
