import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, GitCommit, Brain, Network, CornerDownLeft } from 'lucide-react';
import { SearchResult } from '../../api/search'; // Оставь свой импорт, если он есть

// Моковые данные для демонстрации верстки
const MOCK_RESULTS = [
  {
    id: '1',
    type: 'decision',
    title: 'GitFlow for feature isolation',
    excerpt: 'Isolate risky changes from main branch to maintain stable deployment pipeline...',
    score: 0.92,
    date: '2026-08-15'
  },
  {
    id: '2',
    type: 'claim',
    title: 'IPv4 constraint for networking labs',
    excerpt: 'Strict focus on IPv4 protocol. IPv6 should be ignored unless explicitly specified.',
    score: 0.99,
    date: '2026-05-20'
  },
  {
    id: '3',
    type: 'source',
    title: 'StudyMatch Architecture Diagram',
    excerpt: 'React + Django stack description with PostgreSQL pgvector extension.',
    score: 0.85,
    date: '2026-06-10'
  }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (result: SearchResult | any) => void;
}

export function SemanticSearchModal({ isOpen, onClose, onSelectResult }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement| null>(null);

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
        setSelectedIndex((prev) => (prev + 1) % MOCK_RESULTS.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + MOCK_RESULTS.length) % MOCK_RESULTS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (MOCK_RESULTS[selectedIndex]) {
          onSelectResult(MOCK_RESULTS[selectedIndex]);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, onClose, onSelectResult]);

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
                {MOCK_RESULTS.map((result, index) => {
                  const isActive = index === selectedIndex;
                  return (
                    <div
                      key={result.id}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        onSelectResult(result);
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
                        {getTypeIcon(result.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className={`font-medium truncate ${isActive ? 'text-white/95' : 'text-white/80'}`}>
                            {result.title}
                          </span>
                          <span className="text-[10px] font-mono text-white/30 shrink-0">
                            {result.date}
                          </span>
                        </div>
                        <p className="text-xs text-white/50 truncate">
                          {result.excerpt}
                        </p>
                      </div>

                      {/* Metrics (Score) & Selection Hint */}
                      <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono text-white/40">SCORE</span>
                          <span className="text-xs font-mono text-emerald-400/80">{result.score.toFixed(2)}</span>
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
                  {query.length > 0 ? 'Searching across local memory...' : 'Ready'}
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