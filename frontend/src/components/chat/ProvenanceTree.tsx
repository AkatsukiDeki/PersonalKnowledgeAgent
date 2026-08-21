import React, { useState } from 'react';
import { ChevronRight, ChevronDown, GitBranch, Atom, FileText } from 'lucide-react';
import { Citation } from '../../types/chat';

interface Props {
  citations: Citation[];
}

interface TreeNode {
  type: 'decision' | 'claim' | 'source';
  label: string;
  detail?: string;
  score?: number;
  children: TreeNode[];
}

/**
 * Builds a simple provenance tree from flat citation list.
 * Groups citations by source_id, shows score and snippet.
 */
function buildTree(citations: Citation[]): TreeNode[] {
  // Group by source
  const sourceMap = new Map<string, Citation[]>();
  for (const c of citations) {
    const key = c.source_id || 'unknown';
    if (!sourceMap.has(key)) sourceMap.set(key, []);
    sourceMap.get(key)!.push(c);
  }

  const roots: TreeNode[] = [];
  for (const [sourceId, cites] of sourceMap) {
    const sourceNode: TreeNode = {
      type: 'source',
      label: sourceId.length > 20 ? `📄 ${sourceId.slice(0, 8)}…` : `📄 ${sourceId}`,
      children: cites.map((c) => ({
        type: 'claim' as const,
        label: c.text_snippet.length > 80 ? c.text_snippet.slice(0, 80) + '…' : c.text_snippet,
        detail: c.text_snippet,
        score: c.score,
        children: [],
      })),
    };
    roots.push(sourceNode);
  }
  return roots;
}

const typeConfig = {
  decision: {
    icon: <GitBranch size={13} />,
    color: 'text-entity-decision',
    bg: 'bg-entity-decision/10',
    ring: 'glow-ring-decision',
  },
  claim: {
    icon: <Atom size={13} />,
    color: 'text-entity-claim',
    bg: 'bg-entity-claim/10',
    ring: 'glow-ring-claim',
  },
  source: {
    icon: <FileText size={13} />,
    color: 'text-entity-source',
    bg: 'bg-white/[0.03]',
    ring: '',
  },
};

function TreeNodeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const config = typeConfig[node.type];
  const hasChildren = node.children.length > 0;

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-white/[0.06] pl-3' : ''}>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`group flex items-start gap-2 w-full text-left py-1.5 px-2 rounded-md transition-colors hover:bg-white/[0.04] ${
          hasChildren ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {/* Expand chevron */}
        <span className="mt-0.5 w-3.5 shrink-0">
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={12} className="text-zinc-500" />
            ) : (
              <ChevronRight size={12} className="text-zinc-500" />
            )
          ) : (
            <span className="block w-1.5 h-1.5 rounded-full bg-zinc-700 mt-1 ml-0.5" />
          )}
        </span>

        {/* Icon */}
        <span className={`mt-0.5 shrink-0 ${config.color}`}>{config.icon}</span>

        {/* Label */}
        <span className="text-[11px] text-zinc-300 leading-relaxed flex-1 min-w-0">
          {node.label}
        </span>

        {/* Score badge */}
        {node.score !== undefined && (
          <span className="text-[9px] font-mono text-emerald-500/70 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
            {node.score.toFixed(3)}
          </span>
        )}
      </button>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="mt-0.5">
          {node.children.map((child, i) => (
            <TreeNodeView key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProvenanceTree({ citations }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (!citations || citations.length === 0) return null;

  const tree = buildTree(citations);
  const totalSources = tree.length;
  const totalClaims = citations.length;

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left px-1 py-1 rounded-md hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-[10px] text-entity-decision">🪐</span>
        <span className="text-[11px] font-medium text-zinc-400">
          Provenance Tree
        </span>
        <span className="text-[10px] text-zinc-600 ml-1">
          ({totalClaims} claim{totalClaims !== 1 ? 's' : ''} · {totalSources} source{totalSources !== 1 ? 's' : ''})
        </span>
        <span className="ml-auto">
          {isOpen ? (
            <ChevronDown size={12} className="text-zinc-500" />
          ) : (
            <ChevronRight size={12} className="text-zinc-500" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="mt-1 bg-surface-high/30 rounded-lg p-2 surface-high-border">
          {tree.map((node, i) => (
            <TreeNodeView key={i} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ProvenanceTree;
