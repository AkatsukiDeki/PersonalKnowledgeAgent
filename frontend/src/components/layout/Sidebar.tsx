import React, { useState, useEffect } from 'react';
import { MessageSquare, Plus, Database, Network, Clock, Sparkles, ShieldAlert } from 'lucide-react';
import { conflictsApi } from '../../api/conflicts';

interface Props {
  onOpenUploader: () => void;
  onOpenManager: () => void;
  onOpenPatterns: () => void;
  onOpenGraph: () => void;
  onOpenConflicts: () => void;
  activeView: 'chat' | 'graph' | 'conflicts';
}

export function Sidebar({ onOpenUploader, onOpenManager, onOpenPatterns, onOpenGraph, onOpenConflicts, activeView }: Props) {
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  useEffect(() => {
    // Poll unresolved conflicts count every 15 seconds
    const fetchCount = async () => {
      try {
        const conflicts = await conflictsApi.getConflicts('unresolved');
        setUnresolvedCount(conflicts.length);
      } catch (e) {
        // ignore
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    window.addEventListener('conflictsUpdated', fetchCount);
    return () => {
      clearInterval(interval);
      window.removeEventListener('conflictsUpdated', fetchCount);
    };
  }, []);

  return (
    <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col justify-between shrink-0">
      <div className="p-3">
        {/* Кнопка добавления новой заметки */}
        <button
          onClick={onOpenUploader}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2 px-3 text-xs font-medium transition-colors shadow-xs"
        >
          <Plus size={16} /> Добавить источник
        </button>

        {/* Навигация по модулям памяти */}
        <div className="mt-6 flex flex-col gap-1">
          <div className="px-2 pb-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Память агента
          </div>

          <button 
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium w-full text-left transition-colors ${activeView === 'chat' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            onClick={() => {/* handled in App currently by default */}}
          >
            <MessageSquare size={16} /> Диалог (RAG Chat)
          </button>

          <button onClick={onOpenManager} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 text-xs font-medium w-full text-left transition-colors">
            <Database size={16} /> Источники памяти (L1)
          </button>

          <button 
            onClick={onOpenGraph} 
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium w-full text-left transition-colors ${activeView === 'graph' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <Network size={16} /> Граф сущностей (L3)
          </button>
          
          <button onClick={onOpenPatterns} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 text-xs font-medium w-full text-left transition-colors">
            <Sparkles size={16} /> Инсайты (Паттерны)
          </button>

          <button 
            onClick={onOpenConflicts} 
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium w-full text-left transition-colors ${activeView === 'conflicts' ? 'bg-zinc-800 text-amber-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={16} /> Центр противоречий (L4)
            </div>
            {unresolvedCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {unresolvedCount}
              </span>
            )}
          </button>

          <button className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 text-xs font-medium w-full text-left transition-colors mt-2">
            <Clock size={16} /> Таймлайн событий
          </button>
        </div>
      </div>

      <div className="p-3 border-t border-zinc-800/80">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-zinc-950/60 rounded-lg border border-zinc-800 text-zinc-400 text-[11px]">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>PostgreSQL + pgvector</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;