import React from 'react';
import type { GraphNode, GraphLink } from '../../types/graph';
import {
  ExternalLink,
  X,
  History,
  MessageSquare,
  Compass,
  CircleDot,
  Zap
} from 'lucide-react';
import { endpointId, endpointLabel } from './graphEndpoints';
import { ENTITY_TOKENS, resolveEntityGroup } from '../../utils/entityTokens';
import { LearningModal } from '../learning/LearningModal';
import { useState } from 'react';

export interface MemoryInspectorProps {
  node: GraphNode;
  links: GraphLink[];
  allNodes: GraphNode[];
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
  onViewSource?: (sourceId: string) => void;
  onNavigateToChatWithContext?: (contextText: string) => void;
  onUpdateStatus?: (nodeId: string, isActive: boolean) => void;
}

function Divider() {
  return <div className="h-px w-full bg-white/[0.04] my-4" />;
}

export const MemoryInspector: React.FC<MemoryInspectorProps> = ({
  node,
  links,
  allNodes,
  onClose,
  onSelectNode,
  onViewSource,
  onNavigateToChatWithContext,
  onUpdateStatus,
}) => {
  const incomingLinks = links.filter((l) => endpointId(l.target) === node.id);
  const outgoingLinks = links.filter((l) => endpointId(l.source) === node.id);
  const supportingLinks = [...outgoingLinks, ...incomingLinks];
  
  const [isLearningModalOpen, setIsLearningModalOpen] = useState(false);

  const groupKey = resolveEntityGroup(node);
  const config = ENTITY_TOKENS[groupKey] ?? ENTITY_TOKENS.claim;
  const importance = node.importance ?? node.memory_score;
  const contextText = (node.content || node.label || '').trim();

  const labelFor = (rawId: string): string => {
    const found = allNodes.find((n) => n.id === rawId);
    return found?.label ?? rawId;
  };

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-[#06070B]/60 backdrop-blur-2xl border-l border-white/[0.06] shadow-2xl flex flex-col z-20 animate-[slideInRight_0.3s_ease-out_forwards]">
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* HEADER */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-2 uppercase tracking-wider text-[10px] font-semibold">
          <span className={config.color}>{config.icon}</span>
          <span className={config.color}>{config.label}</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 flex flex-col">

        {/* TITLE */}
        <h2 className={`text-sm font-medium text-zinc-100 leading-snug tracking-wide ${
          !node.is_active ? 'line-through opacity-50' : ''
        }`}>
          {node.label}
        </h2>

        {/* DOMAIN (If exists) */}
        {node.domain && (
          <div className="mt-2 text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
            {node.domain}
          </div>
        )}

        <Divider />

        {/* CONTENT / RATIONALE */}
        {(node.content || node.rationale) && (
          <div className="text-[11px] text-zinc-400 leading-relaxed space-y-2 mb-4">
            {node.content && <p>{node.content}</p>}
            {node.rationale && <p className="italic text-zinc-500">"{node.rationale}"</p>}
          </div>
        )}

        {/* METRICS */}
        {(node.confidence != null || importance != null) && (
          <div className="flex items-center gap-8 mb-4">
            {node.confidence != null && (
              <div>
                <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1">
                  Confidence
                </div>
                <div className="text-xs font-mono text-zinc-300">
                  {node.confidence.toFixed(2)}
                </div>
              </div>
            )}
            {importance != null && (
              <div>
                <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1">
                  Importance
                </div>
                <div className="text-xs font-mono text-zinc-300">
                  {importance.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}

        {node.superseded_by && (
          <div className="mb-4">
            <button
              onClick={() => onSelectNode(node.superseded_by!)}
              className="w-full flex items-center gap-2 p-2 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/15 transition-colors text-[10px] font-medium"
            >
              <History size={12} />
              <span>Superseded — View Replacement</span>
            </button>
          </div>
        )}

        <Divider />

        {/* EVIDENCE / RELATIONS */}
        <div className="flex-1">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-3">
            Evidence & Relations
          </div>

          <div className="flex flex-col gap-1">
            {supportingLinks.length > 0 ? (
              supportingLinks.map((l, i) => {
                // Определяем, куда ведет связь (на нас или от нас)
                const isOutgoing = endpointId(l.source) === node.id;
                const targetId = isOutgoing ? endpointId(l.target) : endpointId(l.source);
                const targetLabel = isOutgoing
                  ? endpointLabel(l.target, labelFor(targetId))
                  : endpointLabel(l.source, labelFor(targetId));

                // Пытаемся угадать цвет по типу связи (в идеале нужно доставать ноду целиком)
                const relType = l.type.toLowerCase();
                const isConflict = relType === 'supersedes' || relType === 'contradicts';
                const linkIconColor = isConflict ? 'text-rose-400' : 'text-zinc-500';

                return (
                  <button
                    key={`${l.id}-${i}`}
                    onClick={() => onSelectNode(targetId)}
                    className="group flex items-start gap-2 p-1.5 rounded hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <div className={`mt-0.5 shrink-0 ${linkIconColor}`}>
                      {isConflict ? <Zap size={11} /> : <CircleDot size={11} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-zinc-300 group-hover:text-zinc-100 transition-colors truncate">
                        {targetLabel}
                      </div>
                      <div className="text-[9px] text-zinc-600 font-mono mt-0.5">
                        {l.type}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-[10px] text-zinc-600 italic">No direct connections</div>
            )}
          </div>
        </div>

        <Divider />

        {/* ACTIONS */}
        <div className="flex gap-2 pb-2">
          {onViewSource && node.source_id && (
            <button
              onClick={() => onViewSource?.(node.source_id!)}
              className="flex-1 py-1.5 flex items-center justify-center gap-1.5 bg-transparent border border-white/[0.08] hover:bg-white/[0.04] text-zinc-300 text-[10px] uppercase tracking-wider font-semibold rounded transition-colors"
            >
              <ExternalLink size={12} />
              Source
            </button>
          )}
          {onNavigateToChatWithContext && (
            <button
              onClick={() => {
                const prompt = `Расскажи подробнее про сущность: ${node.label} (Тип: ${node.category}). Контекст: ${contextText}`;
                window.dispatchEvent(new CustomEvent('injectChatPrompt', { detail: prompt }));
                window.dispatchEvent(new CustomEvent('switchTab', { detail: 'chat' }));
                onNavigateToChatWithContext?.(prompt);
              }}
              className="flex-1 py-1.5 flex items-center justify-center gap-1.5 bg-transparent border border-white/[0.08] hover:bg-white/[0.04] text-zinc-300 text-[10px] uppercase tracking-wider font-semibold rounded transition-colors"
            >
              <MessageSquare size={12} />
              Open Chat
            </button>
          )}
          <button
            onClick={() => setIsLearningModalOpen(true)}
            className="flex-1 py-1.5 flex items-center justify-center gap-1.5 bg-transparent border border-white/[0.08] hover:bg-white/[0.04] text-zinc-300 text-[10px] uppercase tracking-wider font-semibold rounded transition-colors"
          >
            <Compass size={12} />
            Learn
          </button>
          {onUpdateStatus && (
            <button
              onClick={() => onUpdateStatus(node.id, !node.is_active)}
              className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 border hover:bg-white/[0.04] text-[10px] uppercase tracking-wider font-semibold rounded transition-colors ${
                node.is_active 
                  ? 'border-rose-500/20 text-rose-400 hover:bg-rose-500/10' 
                  : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <History size={12} />
              {node.is_active ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>

      </div>
      
      <LearningModal 
        isOpen={isLearningModalOpen}
        onClose={() => setIsLearningModalOpen(false)}
        topic={node.label}
      />
    </div>
  );
};