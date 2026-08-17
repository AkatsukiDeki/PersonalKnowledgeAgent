import React from 'react';
import { GraphNode, GraphLink } from '../../types/graph';
import { ExternalLink, X, History } from 'lucide-react';

interface NodeInspectorProps {
  node: GraphNode;
  links: GraphLink[];
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
  onViewSource?: (sourceId: string) => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  node,
  links,
  onClose,
  onSelectNode,
  onViewSource
}) => {
  const incomingLinks = links.filter(l => (typeof l.target === 'object' ? l.target.id : l.target) === node.id);
  const outgoingLinks = links.filter(l => (typeof l.source === 'object' ? l.source.id : l.source) === node.id);

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-20 overflow-y-auto animate-in slide-in-from-right">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
        <h2 className="font-bold text-slate-800 dark:text-slate-100 capitalize">
          {node.group === 'entity' ? 'Entity Details' : 'Claim Details'}
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500">
          <X size={18} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div>
          <div className="flex gap-2 items-center mb-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
              {node.category || node.group}
            </span>
            {node.group === 'claim' && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${node.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                {node.is_active ? 'Active' : 'Superseded'}
              </span>
            )}
          </div>
          
          <h3 className={`text-lg font-medium text-slate-900 dark:text-slate-50 ${!node.is_active && node.group === 'claim' ? 'line-through opacity-70' : ''}`}>
            {node.label}
          </h3>
          
          {node.confidence !== undefined && (
            <div className="mt-2 text-sm text-slate-500 flex items-center gap-1">
              <span>Confidence:</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{(node.confidence * 100).toFixed(0)}%</span>
            </div>
          )}
          
          {node.superseded_by && (
             <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg text-sm text-red-800 dark:text-red-300 flex items-start gap-2 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  onClick={() => onSelectNode(node.superseded_by!)}>
               <History size={16} className="mt-0.5 shrink-0" />
               <div>
                 <p className="font-medium">Superseded By</p>
                 <p className="opacity-80 text-xs mt-0.5">Click to view newer claim</p>
               </div>
             </div>
          )}
        </div>

        {node.source_id && onViewSource && (
          <button 
            onClick={() => onViewSource(node.source_id!)}
            className="w-full py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-blue-200 dark:border-blue-800/50"
          >
            <ExternalLink size={16} />
            View Source Document
          </button>
        )}

        {outgoingLinks.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">Outgoing Relations</h4>
            <div className="flex flex-col gap-2">
              {outgoingLinks.map((l, i) => {
                const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                const targetLabel = typeof l.target === 'object' ? (l.target as any).label : 'Unknown';
                return (
                  <div key={i} className="text-sm p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="font-mono text-xs text-blue-500 mb-1">{l.type}</div>
                    <button onClick={() => onSelectNode(targetId)} className="text-left hover:text-blue-500 transition-colors line-clamp-2">
                      {targetLabel}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
        {incomingLinks.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">Incoming Relations</h4>
            <div className="flex flex-col gap-2">
              {incomingLinks.map((l, i) => {
                const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                const sourceLabel = typeof l.source === 'object' ? (l.source as any).label : 'Unknown';
                return (
                  <div key={i} className="text-sm p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="font-mono text-xs text-emerald-500 mb-1">{l.type}</div>
                    <button onClick={() => onSelectNode(sourceId)} className="text-left hover:text-blue-500 transition-colors line-clamp-2">
                      {sourceLabel}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
};
