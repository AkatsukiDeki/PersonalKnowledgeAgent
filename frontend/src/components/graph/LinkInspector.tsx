import React from 'react';
import { GraphLink } from '../../types/graph';
import { X, ArrowRight } from 'lucide-react';

interface LinkInspectorProps {
  link: GraphLink;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

export const LinkInspector: React.FC<LinkInspectorProps> = ({ link, onClose, onSelectNode }) => {
  const sourceLabel = typeof link.source === 'object' ? (link.source as any).label : 'Unknown';
  const targetLabel = typeof link.target === 'object' ? (link.target as any).label : 'Unknown';
  const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
  const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[400px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-xl flex flex-col z-20 animate-in slide-in-from-bottom-10">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30 rounded-t-xl">
        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 font-mono">
          Relation: {link.type}
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-500">
          <X size={16} />
        </button>
      </div>
      <div className="p-4 flex flex-col gap-3">
        
        <div className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
          <button onClick={() => onSelectNode(sourceId)} className="text-sm text-left hover:text-blue-500 line-clamp-2">
            {sourceLabel}
          </button>
          <div className="flex justify-center text-slate-400">
            <ArrowRight size={16} />
          </div>
          <button onClick={() => onSelectNode(targetId)} className="text-sm text-left hover:text-blue-500 line-clamp-2">
            {targetLabel}
          </button>
        </div>

        {link.confidence !== undefined && (
          <div className="text-sm text-slate-500 flex justify-between items-center px-1">
            <span>Confidence</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{(link.confidence * 100).toFixed(0)}%</span>
          </div>
        )}
        
        {link.evidence_summary && (
          <div className="mt-1">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 px-1">Evidence Summary</h4>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg text-sm text-slate-700 dark:text-slate-300 italic">
              "{link.evidence_summary}"
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
};
