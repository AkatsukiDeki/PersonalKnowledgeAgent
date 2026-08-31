import React from 'react';
import { HelpCircle, AlignLeft, CheckSquare, MessageSquare, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export type ContextActionType = 'explain' | 'summarize' | 'create_task';

interface Props {
  rect: DOMRect | null;
  onAction: (action: ContextActionType) => void;
  onAskChat: () => void;
  isLoading: boolean;
  activeAction: string | null;
}

export function SelectionToolbar({ rect, onAction, onAskChat, isLoading, activeAction }: Props) {
  if (!rect) return null;

  return (
    <div
      className={clsx(
        "fixed z-[70] flex items-center gap-1 p-1 bg-neutral-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95",
        isLoading && "pointer-events-none opacity-80"
      )}
      style={{
        top: Math.max(10, rect.top - 48),
        left: rect.left + rect.width / 2,
        transform: 'translateX(-50%)'
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing selection when clicking toolbar
    >
      <button
        onClick={() => onAction('explain')}
        disabled={isLoading}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
          activeAction === 'explain' ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-300 hover:bg-white/10 hover:text-white"
        )}
      >
        {isLoading && activeAction === 'explain' ? <Loader2 size={14} className="animate-spin" /> : <HelpCircle size={14} />}
        Объяснить
      </button>

      <button
        onClick={() => onAction('summarize')}
        disabled={isLoading}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
          activeAction === 'summarize' ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-300 hover:bg-white/10 hover:text-white"
        )}
      >
        {isLoading && activeAction === 'summarize' ? <Loader2 size={14} className="animate-spin" /> : <AlignLeft size={14} />}
        Кратко
      </button>

      <button
        onClick={() => onAction('create_task')}
        disabled={isLoading}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
          activeAction === 'create_task' ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-300 hover:bg-white/10 hover:text-white"
        )}
      >
        {isLoading && activeAction === 'create_task' ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
        В задачи
      </button>

      <div className="w-px h-4 bg-white/10 mx-1" />

      <button
        onClick={onAskChat}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-colors"
      >
        <MessageSquare size={14} />
        В Чат
      </button>
    </div>
  );
}
