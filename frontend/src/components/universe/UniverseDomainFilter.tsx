import React from 'react';
import { Database, Link2 } from 'lucide-react';

interface Props {
  domains: string[];
  selectedDomain: string | null;
  compareDomain: string | null;
  onSelect: (domain: string | null) => void;
  onCompare: (domain: string | null) => void;
  showBridges: boolean;
  onToggleBridges: (show: boolean) => void;
}

export const UniverseDomainFilter: React.FC<Props> = ({ domains, selectedDomain, compareDomain, onSelect, onCompare, showBridges, onToggleBridges }) => {
  return (
    <div className="absolute top-20 left-6 z-20 flex flex-col gap-2 max-w-[250px]">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-indigo-400/80 mb-1 ml-1 drop-shadow-md">
        <Database size={12} /> Domain Constellations
      </div>
      <div className="flex flex-wrap gap-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
        <button
          onClick={() => {
            onSelect(null);
            onCompare(null);
          }}
          className={`px-3 py-1.5 rounded-full text-[11px] font-mono transition-all duration-300 backdrop-blur-md border ${
            selectedDomain === null
              ? 'bg-indigo-500/30 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]'
              : 'bg-black/40 border-zinc-700/50 text-zinc-400 hover:bg-black/60 hover:border-zinc-500 hover:text-zinc-200'
          }`}
        >
          ALL
        </button>
        {domains.map(domain => {
          const isSelected = selectedDomain === domain;
          const isCompared = compareDomain === domain;
          
          return (
            <div key={domain} className="flex items-center gap-1">
              <button
                onClick={() => onSelect(domain)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all duration-300 backdrop-blur-md border ${
                  isSelected
                    ? 'bg-indigo-500/30 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                    : isCompared
                      ? 'bg-emerald-500/30 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                      : 'bg-black/40 border-zinc-700/50 text-zinc-400 hover:bg-black/60 hover:border-zinc-500 hover:text-zinc-200'
                }`}
              >
                {domain}
              </button>
              
              {selectedDomain && !isSelected && (
                <button
                  onClick={() => onCompare(isCompared ? null : domain)}
                  className={`p-1.5 rounded-full transition-colors border ${
                    isCompared 
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' 
                      : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50 hover:text-emerald-400 hover:border-emerald-500/50'
                  }`}
                  title={isCompared ? "Stop comparing" : "Compare with this domain"}
                >
                  <Link2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selectedDomain && (
        <div className="mt-2 pl-1">
          <button
            onClick={() => onToggleBridges(!showBridges)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-mono tracking-wider transition-all duration-300 backdrop-blur-md border ${
              showBridges
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                : 'bg-black/40 border-zinc-700/50 text-zinc-500 hover:bg-black/60 hover:text-zinc-300'
            }`}
            title="Показывать связи (мосты) с другими доменами"
          >
            <Link2 size={12} className={showBridges ? 'text-amber-400' : 'text-zinc-500'} />
            Bridges: {showBridges ? 'ON' : 'OFF'}
          </button>
        </div>
      )}
    </div>
  );
};
