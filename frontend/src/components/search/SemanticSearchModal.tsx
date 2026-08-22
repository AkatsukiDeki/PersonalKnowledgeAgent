import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, GitCommit, Brain, Network, CornerDownLeft } from 'lucide-react';
import { searchApi, SearchResult } from '../../api/search';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (result: SearchResult | any) => void;
}

export function SemanticSearchModal({ isOpen, onClose, onSelectResult }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement| null>(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    let active = true;
    setIsSearching(true);
    searchApi.query(debouncedQuery).then(res => {
      if (active) {
        setResults(res.results || []);
        setIsSearching(false);
        setSelectedIndex(0);
      }
    }).catch(() => {
      if (active) setIsSearching(false);
    });
    return () => { active = false; };
  }, [debouncedQuery]);

  // Фокус на инпут при открытии
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Обработка клавиш (навигация стрелками, Enter, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, results.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(1, results.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          const res = results[selectedIndex];
          onSelectResult(res);
          const targetId = res.claim_id || res.chunk_id || res.source_id;
          
          window.dispatchEvent(new CustomEvent('switchFilter', { detail: 'all' }));
          window.dispatchEvent(new CustomEvent('switchTab', { detail: 'universe' }));
          window.dispatchEvent(new CustomEvent('focusNode', { detail: targetId }));
          
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, onClose, onSelectResult, results]);

  // Рендер иконки в зависимости от типа сущности
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'decision': return <GitCommit size={14} className="text-indigo-400" />;
      case 'claim': return <Network size={14} className="text-emerald-400" />;
      case 'source': return <FileText size={14} className="text-amber-400" />;
      case 'insight': return <Brain size={14} className="text-fuchsia-400" />;
      default: return <FileText size={14} className="text-white/40" />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]"
            onClick={onClose}
          >
            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-2xl bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()} // Предотвращаем закрытие при клике внутри
            >

              {/* Search Input Area */}
              <div className="flex items-center px-4 py-4 border-b border-white/5 bg-white/[0.02]">
                <Search className="w-5 h-5 text-white/40 mr-3" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask your memory, search entities, or find decisions..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-white/90 placeholder-white/30 text-lg font-light"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-white/20 bg-white/5 px-2 py-1 rounded">ESC to close</span>
                </div>
              </div>

              {/* Results List */}
              <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {results.map((result, index) => {
                  const isActive = index === selectedIndex;
                  const type = result.claim_id ? 'claim' : (result.chunk_id ? 'source' : 'decision');
                  const title = result.text_content.substring(0, 60).replace(/\n/g, ' ') + (result.text_content.length > 60 ? '...' : '');
                  const excerpt = result.text_content.substring(0, 150).replace(/\n/g, ' ') + '...';
                  
                  return (
                    <div
                      key={result.chunk_id}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        onSelectResult(result);
                        const targetId = result.claim_id || result.chunk_id || result.source_id;
                        window.dispatchEvent(new CustomEvent('switchFilter', { detail: 'all' }));
                        window.dispatchEvent(new CustomEvent('switchTab', { detail: 'universe' }));
                        window.dispatchEvent(new CustomEvent('focusNode', { detail: targetId }));
                        onClose();
                      }}
                      className={`
                        w-full flex items-start gap-4 p-3 rounded-xl cursor-pointer transition-colors duration-150
                        ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04] bg-transparent'}
                      `}
                    >
                      {/* Icon Box */}
                      <div className={`
                        p-2 rounded-lg mt-0.5
                        ${isActive ? 'bg-white/10 shadow-sm' : 'bg-white/5'}
                      `}>
                        {getTypeIcon(type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className={`font-medium truncate ${isActive ? 'text-white/95' : 'text-white/80'}`}>
                            {title}
                          </span>
                        </div>
                        <p className="text-xs text-white/50 truncate">
                          {excerpt}
                        </p>
                      </div>

                      {/* Metrics (Score) & Selection Hint */}
                      <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono text-white/40">SCORE</span>
                          <span className="text-xs font-mono text-emerald-400/80">{(result.rrf_score || result.similarity || 0).toFixed(2)}</span>
                        </div>
                        {isActive && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-indigo-400 mt-1" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer / Status Bar */}
              <div className="h-8 border-t border-white/5 bg-black/40 flex items-center justify-between px-4">
                <span className="text-[10px] font-mono text-white/30">
                  {isSearching ? 'Searching...' : (query.length > 0 ? `Found ${results.length} results` : 'Ready')}
                </span>
                <div className="flex items-center gap-3 text-[10px] text-white/30 font-mono">
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white/10 px-1 rounded">↑↓</kbd> to navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="bg-white/10 px-1 rounded">↵</kbd> to select
                  </span>
                </div>
              </div>

            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}