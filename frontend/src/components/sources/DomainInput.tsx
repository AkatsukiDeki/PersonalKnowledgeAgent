import React, { useMemo } from 'react';
import { Tag, Sparkles } from 'lucide-react';
import clsx from 'clsx';

export interface DomainInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
}

export const DomainInput: React.FC<DomainInputProps> = ({
  value,
  onChange,
  suggestions,
  placeholder = 'Например: University, Security, PKA',
  disabled = false,
}) => {
  // Фильтрация подсказок по текущему вводу (substring match, case-insensitive)
  const filteredSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return suggestions;
    return suggestions.filter(s => s.toLowerCase().includes(query));
  }, [value, suggestions]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(value.trim())}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={50}
          className="w-full pl-9 pr-4 py-2 bg-neutral-900/60 border border-neutral-700/60 rounded-xl text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50"
        />
      </div>

      {filteredSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-medium text-neutral-500 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500/70" /> Домены:
          </span>
          {filteredSuggestions.map((domain) => {
            const isSelected = value.trim().toLowerCase() === domain.toLowerCase();
            return (
              <button
                key={domain}
                type="button"
                onClick={() => onChange(domain)}
                disabled={disabled}
                className={clsx(
                  'px-2 py-0.5 rounded-lg text-xs transition-all border font-medium',
                  isSelected
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/10'
                    : 'bg-neutral-800/60 text-neutral-400 border-neutral-700/50 hover:bg-neutral-700/60 hover:text-neutral-200'
                )}
              >
                {domain}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
