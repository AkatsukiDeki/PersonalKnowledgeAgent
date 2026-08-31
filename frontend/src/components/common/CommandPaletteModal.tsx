import React, { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, FileText, Brain, Loader2 } from 'lucide-react';
import { CommandItem } from '../../commands/types';
import { filterAndRankCommands } from '../../commands/commandRegistry';
import { searchApi, QuickSearchResultItem } from '../../api/search';
import { useInspector } from '../../context/InspectorContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
  onAskChat: (query: string) => void;
  onOpenSource?: (sourceId: string) => void;
}

export function CommandPaletteModal({ isOpen, onClose, commands, onAskChat, onOpenSource }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [searchResults, setSearchResults] = useState<QuickSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const { inspectEntity } = useInspector();

  const filteredCommands = filterAndRankCommands(commands, query);
  
  // Show "Ask PKA" if no commands match or query is long (e.g. >= 3 words)
  const isQueryLong = query.trim().split(/\s+/).length >= 3;
  const showAskPka = query.trim().length > 0 && (filteredCommands.length === 0 || isQueryLong);

  // Debounced Search
  useEffect(() => {
    if (!isOpen || query.trim().length < 3 || filteredCommands.length > 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const res = await searchApi.quickLookup(query);
        setSearchResults(res.results);
      } catch (err) {
        console.error('Quick lookup failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [query, isOpen, filteredCommands.length]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setSearchResults([]);
      setIsSearching(false);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, searchResults.length]);

  const totalItems = filteredCommands.length + searchResults.length + (showAskPka ? 1 : 0);

  const executeItem = (index: number) => {
    if (index < filteredCommands.length) {
      filteredCommands[index].execute();
      onClose();
    } else if (index < filteredCommands.length + searchResults.length) {
      const res = searchResults[index - filteredCommands.length];
      if (res.type === 'source') {
        if (onOpenSource) onOpenSource(res.id);
      } else {
        inspectEntity({
          id: res.id,
          type: res.type as any,
          title: res.title,
          summary: res.snippet
        });
      }
      onClose();
    } else if (showAskPka && index === totalItems - 1) {
      onAskChat(query);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    
    const maxIndex = Math.max(0, totalItems - 1);
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < maxIndex ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : maxIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeItem(selectedIndex);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50">
          <Search size={20} className="text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Что вы хотите сделать или найти?"
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-lg"
          />
          {isSearching && <Loader2 size={16} className="text-zinc-500 animate-spin" />}
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filteredCommands.length > 0 && (
            <div className="px-2">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 mb-2 mt-1">Команды</div>
              {filteredCommands.map((cmd, i) => (
                <div
                  key={cmd.id}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => executeItem(i)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    i === selectedIndex ? 'bg-indigo-500/10 text-indigo-300' : 'text-zinc-300 hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={i === selectedIndex ? 'text-indigo-400' : 'text-zinc-500'}>
                      {cmd.icon || <Search size={16} />}
                    </div>
                    <div>
                      <div className="font-medium">{cmd.title}</div>
                      {cmd.description && <div className="text-xs opacity-70 mt-0.5">{cmd.description}</div>}
                    </div>
                  </div>
                  {cmd.shortcut && (
                    <div className="text-[10px] bg-zinc-800/50 text-zinc-500 px-2 py-1 rounded border border-zinc-700">
                      {cmd.shortcut}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="px-2 mt-2">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 mb-2 mt-1">Факты и Документы (RAG)</div>
              {searchResults.map((res, i) => {
                const globalIndex = filteredCommands.length + i;
                return (
                  <div
                    key={res.id}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    onClick={() => executeItem(globalIndex)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      globalIndex === selectedIndex ? 'bg-emerald-500/10 text-emerald-300' : 'text-zinc-300 hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className={globalIndex === selectedIndex ? 'text-emerald-400 shrink-0' : 'text-zinc-500 shrink-0'}>
                        {res.type === 'source' ? <FileText size={16} /> : <Brain size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{res.title}</div>
                        <div className="text-xs opacity-70 mt-0.5 truncate">{res.snippet}</div>
                      </div>
                      <div className="text-[10px] bg-zinc-800/50 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 shrink-0">
                        {Math.round(res.score * 100)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isSearching && filteredCommands.length === 0 && searchResults.length === 0 && !showAskPka ? (
            <div className="px-5 py-8 text-center text-zinc-500 text-sm">
              Ничего не найдено
            </div>
          ) : null}

          {showAskPka && (
            <div className="px-2 mt-2">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 mb-2 mt-2">ИИ Ассистент</div>
              <div
                onMouseEnter={() => setSelectedIndex(totalItems - 1)}
                onClick={() => executeItem(totalItems - 1)}
                className={`flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-colors border ${
                  selectedIndex === totalItems - 1
                    ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' 
                    : 'text-zinc-300 hover:bg-zinc-900/50 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-500/20 p-1.5 rounded-lg text-indigo-400">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className="font-medium">Спросить PKA</div>
                    <div className="text-xs opacity-70 mt-0.5 italic">«{query}»</div>
                  </div>
                </div>
                <div className="text-[10px] bg-zinc-800/50 text-zinc-500 px-2 py-1 rounded border border-zinc-700">
                  Enter
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="px-4 py-3 bg-zinc-900/50 border-t border-zinc-800/50 text-xs text-zinc-500 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 text-[10px]">↑</kbd>
            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 text-[10px]">↓</kbd>
            <span>Навигация</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 text-[10px]">Enter</kbd>
            <span>Выбрать</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 text-[10px]">Esc</kbd>
            <span>Закрыть</span>
          </div>
        </div>
      </div>
    </div>
  );
}
