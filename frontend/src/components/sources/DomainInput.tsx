import React, { useMemo, useState } from 'react';
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
  const [isFocused, setIsFocused] = useState(false);

  // Фильтрация подсказок по текущему вводу (substring match, case-insensitive)
  const filteredSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const unique = Array.from(new Set(suggestions.map(s => s.toLowerCase())));
    if (!query) return unique;
    return unique.filter(s => s.includes(query));
  }, [value, suggestions]);

  return (
    <div className="relative">
      <div className="relative">
        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setTimeout(() => {
              setIsFocused(false);
              onChange(value.trim());
            }, 150);
          }}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={50}
          className="w-full pl-9 pr-4 py-1.5 bg-neutral-900/60 border border-neutral-700/60 rounded-xl text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50"
        />
      </div>

      {isFocused && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl z-50 p-2 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
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
