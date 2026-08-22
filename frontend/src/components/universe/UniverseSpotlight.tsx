import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Sparkles, BookOpen, MessageSquare, Lightbulb, Folder, X } from 'lucide-react';

export interface SearchableEntity {
  id: string;
  title: string;
  subtitle: string;
  type: 'constellation' | 'subject' | 'chat_folder' | 'source' | 'conversation' | 'insight';
  category: string;
  color: string;
  worldX: number;
  worldY: number;
  targetZoom: number;
  originalEntity: any;
}

interface UniverseSpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  entities: SearchableEntity[];
  onSelectEntity: (entity: SearchableEntity) => void;
}

export const UniverseSpotlight: React.FC<UniverseSpotlightProps> = ({
  isOpen,
  onClose,
  entities,
  onSelectEntity,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entities.slice(0, 8);
    const q = query.toLowerCase();
    return entities
      .filter((e) => e.title.toLowerCase().includes(q) || e.subtitle.toLowerCase().includes(q))
      .slice(0, 10);
  }, [entities, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelectEntity(filtered[selectedIndex]);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  const renderIcon = (type: SearchableEntity['type']) => {
    switch (type) {
      case 'subject':
        return <Sparkles size={14} className="text-indigo-400" />;
      case 'source':
        return <BookOpen size={14} className="text-sky-400" />;
      case 'conversation':
        return <MessageSquare size={14} className="text-violet-400" />;
      case 'chat_folder':
        return <Folder size={14} className="text-cyan-400" />;
      case 'insight':
        return <Lightbulb size={14} className="text-amber-400" />;
      default:
        return <Sparkles size={14} className="text-zinc-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-[#111116] border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Поле ввода */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800/80">
          <Search size={18} className="text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск по галактике (предметы, чаты, источники, инсайты)..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-800/80 border border-zinc-700/60 rounded">
            ESC
          </kbd>
        </div>

        {/* Список результатов */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">Объекты в галактике не найдены</div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={`${item.type}-${item.id}-${idx}`}
                  onClick={() => {
                    onSelectEntity(item);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                    isSelected ? 'bg-zinc-800/80 text-white' : 'text-zinc-300 hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      {renderIcon(item.type)}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-medium truncate text-zinc-100">{item.title}</div>
                      <div className="text-[10px] text-zinc-400 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Футер с подсказками */}
        <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-900/40 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>Навигация: ↑ ↓</span>
          <span>Перейти к объекту: ↵ Enter</span>
        </div>
      </div>
    </div>
  );
};
