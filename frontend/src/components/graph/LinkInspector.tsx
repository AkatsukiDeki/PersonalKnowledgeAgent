import React from 'react';
import { GraphLink } from '../../types/graph';
import { X, ArrowRight } from 'lucide-react';
import { endpointId, endpointLabel } from './graphEndpoints';

interface LinkInspectorProps {
  link: GraphLink;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

export const LinkInspector: React.FC<LinkInspectorProps> = ({ link, onClose, onSelectNode }) => {
  const sourceLabel = endpointLabel(link.source);
  const targetLabel = endpointLabel(link.target);
  const sourceId = endpointId(link.source);
  const targetId = endpointId(link.target);

  const isConflict = link.type === 'supersedes' || link.type === 'contradicts'
    || link.type === 'SUPERSEDES' || link.type === 'CONTRADICTS';

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[380px] surface-glass rounded-xl flex flex-col z-20">
      <div className="p-3 border-b border-white/[0.06] flex justify-between items-center">
        <h3 className="text-[11px] font-semibold text-zinc-300 font-mono flex items-center gap-1.5">
          <span className={isConflict ? 'text-entity-conflict' : 'text-entity-decision'}>⟶</span>
          {link.type}
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-white/[0.06] rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1.5 p-2.5 bg-surface-high/30 rounded-lg surface-high-border">
          <button
            onClick={() => onSelectNode(sourceId)}
            className="text-[11px] text-left text-zinc-300 hover:text-entity-claim transition-colors line-clamp-2"
          >
            {sourceLabel}
          </button>
          <div className="flex justify-center text-zinc-600">
            <ArrowRight size={14} />
          </div>
          <button
            onClick={() => onSelectNode(targetId)}
            className="text-[11px] text-left text-zinc-300 hover:text-entity-claim transition-colors line-clamp-2"
          >
            {targetLabel}
          </button>
        </div>

        {link.confidence !== undefined && (
          <div className="flex items-center justify-between px-1 text-[10px]">
            <span className="text-zinc-500">Confidence</span>
            <span className="text-zinc-300 font-mono">{(link.confidence * 100).toFixed(0)}%</span>
          </div>
        )}

        {link.evidence_summary && (
          <div>
            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 px-1">Evidence</h4>
            <div className="p-2.5 bg-entity-decision/5 border border-entity-decision/15 rounded-lg text-[11px] text-zinc-400 italic leading-relaxed">
              "{link.evidence_summary}"
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
