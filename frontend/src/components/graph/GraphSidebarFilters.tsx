import React, { useMemo } from 'react';
import { GraphNode } from '../../types/graph';

interface GraphSidebarFiltersProps {
  nodes: GraphNode[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  showSuperseded: boolean;
  onToggleSuperseded: () => void;
}

export const GraphSidebarFilters: React.FC<GraphSidebarFiltersProps> = ({
  nodes,
  selectedCategory,
  onSelectCategory,
  showSuperseded,
  onToggleSuperseded
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
  
  const activeCount = nodes.filter(n => n.is_active).length;
  const supersededCount = nodes.filter(n => !n.is_active && n.group === 'claim').length;

  return (
    <div className="absolute top-4 left-4 z-10 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-4 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Filters</h2>
      
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Show Superseded</span>
        <button 
          onClick={onToggleSuperseded}
          className={`w-10 h-6 rounded-full transition-colors relative ${showSuperseded ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${showSuperseded ? 'left-5' : 'left-1'}`} />
        </button>
      </div>
      
      <div className="text-xs text-slate-500 flex justify-between">
        <span>Active nodes: {activeCount}</span>
        <span>Superseded: {supersededCount}</span>
      </div>
      
      <hr className="border-slate-200 dark:border-slate-800" />
      
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Domains</h3>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onSelectCategory(null)}
            className={`text-left px-2 py-1 text-sm rounded ${selectedCategory === null ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
          >
            All Domains
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => onSelectCategory(cat)}
              className={`text-left px-2 py-1 text-sm rounded capitalize ${selectedCategory === cat ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
