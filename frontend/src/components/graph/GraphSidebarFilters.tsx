import React, { useMemo } from 'react';
import { GraphNode } from '../../types/graph';
import { Sparkles, GitBranch, Atom, FileText, Eye, EyeOff } from 'lucide-react';

interface GraphSidebarFiltersProps {
  nodes: GraphNode[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  showSuperseded: boolean;
  onToggleSuperseded: () => void;
  showDecisions: boolean;
  onToggleDecisions: () => void;
}

export const GraphSidebarFilters: React.FC<GraphSidebarFiltersProps> = ({
  nodes,
  selectedCategory,
  onSelectCategory,
  showSuperseded,
  onToggleSuperseded,
  showDecisions,
  onToggleDecisions
}) => {
  const categories = useMemo(() => {
    const cats = new Set<string>();
    nodes.forEach(n => {
      if (n.group === 'claim' && n.category) {
        cats.add(n.category);
      }
    });
    return Array.from(cats).sort();
  }, [nodes]);

  const claimCount = nodes.filter(n => n.group === 'claim' && n.is_active !== false).length;
  const supersededCount = nodes.filter(n => !n.is_active && n.group === 'claim').length;
  const decisionCount = nodes.filter(n => n.group === 'decision').length;
  const entityCount = nodes.filter(n => n.group === 'entity').length;

  return (
    <div className="absolute top-4 left-4 z-10 w-56 surface-glass rounded-xl p-3 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={13} className="text-entity-insight" />
        <h2 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">Universe Filters</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <StatBadge icon={<Atom size={10} />} color="text-entity-claim" label="Claims" count={claimCount} />
        <StatBadge icon={<GitBranch size={10} />} color="text-entity-decision" label="Decisions" count={decisionCount} />
        <StatBadge icon={<FileText size={10} />} color="text-entity-source" label="Entities" count={entityCount} />
        <StatBadge icon={<Eye size={10} />} color="text-zinc-500" label="Superseded" count={supersededCount} />
      </div>

      {/* Toggles */}
      <div className="space-y-2 pt-1 border-t border-white/[0.06]">
        <ToggleRow
          label="Superseded"
          active={showSuperseded}
          onToggle={onToggleSuperseded}
          activeColor="bg-entity-source"
        />
        <ToggleRow
          label="Decisions"
          active={showDecisions}
          onToggle={onToggleDecisions}
          activeColor="bg-entity-decision"
        />
      </div>

      {/* Domain filter */}
      {categories.length > 0 && (
        <div className="pt-1 border-t border-white/[0.06]">
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Domains</h3>
          <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto scrollbar-thin">
            <DomainButton label="All Domains" active={selectedCategory === null} onClick={() => onSelectCategory(null)} />
            {categories.map(cat => (
              <DomainButton key={cat} label={cat} active={selectedCategory === cat} onClick={() => onSelectCategory(cat)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Sub-components ── */

function StatBadge({ icon, color, label, count }: { icon: React.ReactNode; color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1 bg-white/[0.03] rounded px-1.5 py-1">
      <span className={color}>{icon}</span>
      <span className="text-zinc-500">{label}:</span>
      <span className="text-zinc-300 font-medium">{count}</span>
    </div>
  );
}

function ToggleRow({ label, active, onToggle, activeColor }: { label: string; active: boolean; onToggle: () => void; activeColor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <button
        onClick={onToggle}
        className={`w-8 h-4.5 rounded-full transition-colors relative ${active ? activeColor : 'bg-zinc-700'}`}
      >
        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${active ? 'left-4' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function DomainButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left px-2 py-1 text-[11px] rounded capitalize transition-colors ${
        active
          ? 'bg-entity-claim/15 text-entity-claim'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
      }`}
    >
      {label}
    </button>
  );
}
