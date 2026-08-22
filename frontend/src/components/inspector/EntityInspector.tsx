import React, { useEffect } from 'react';
import { useInspector } from '../../context/InspectorContext';
import { 
  X, 
  BookOpen, 
  FileText, 
  Sparkles, 
  History, 
  MessageSquare, 
  ExternalLink, 
  Layers, 
  Compass
} from 'lucide-react';
import clsx from 'clsx';

export const EntityInspector: React.FC = () => {
  const { activeEntity, isOpen, closeInspector } = useInspector();

  // Закрытие по Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeInspector();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeInspector]);

  if (!isOpen || !activeEntity) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'subject': return <BookOpen size={16} className="text-indigo-400" />;
      case 'source': return <FileText size={16} className="text-blue-400" />;
      case 'claim': return <Sparkles size={16} className="text-amber-400" />;
      case 'pattern': return <Layers size={16} className="text-emerald-400" />;
      case 'timeline_event': return <History size={16} className="text-purple-400" />;
      default: return <Compass size={16} className="text-zinc-400" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'subject': return 'Предмет / Орбита';
      case 'source': return 'Первоисточник';
      case 'claim': return 'Утверждение / Факт';
      case 'pattern': return 'Скрытый паттерн';
      case 'timeline_event': return 'Событие таймлайна';
      default: return 'Сущность';
    }
  };

  return (
    <aside 
      className={clsx(
        "fixed top-0 right-0 h-full w-96 bg-[#0f0f13]/95 backdrop-blur-xl border-l border-zinc-800/90 z-50",
        "flex flex-col shadow-2xl transition-all duration-300 transform",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Шапка */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getTypeIcon(activeEntity.type)}
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {getTypeName(activeEntity.type)}
          </span>
        </div>
        <button
          onClick={closeInspector}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/60 transition-all"
        >
          <X size={16} />
        </button>
      </div>

      {/* Контент: Что это и почему */}
      <div className="p-5 flex-1 overflow-y-auto space-y-6">
        <div>
          <h2 className="text-base font-bold text-white leading-tight">
            {activeEntity.title}
          </h2>
          {activeEntity.subtitle && (
            <p className="text-xs text-zinc-400 mt-1">{activeEntity.subtitle}</p>
          )}
        </div>

        {/* Описание / Сводка */}
        {activeEntity.summary && (
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800/70 rounded-xl">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1.5">
              Сводка
            </span>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {activeEntity.summary}
            </p>
          </div>
        )}

        {/* Контекст происхождения (Почему оно здесь) */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
            Связанный контекст
          </span>

          {activeEntity.parentSubject && (
            <div className="p-2.5 bg-zinc-900/40 border border-zinc-800/60 rounded-xl flex items-center justify-between text-xs">
              <span className="text-zinc-400">Предмет:</span>
              <span className="font-medium text-indigo-300 truncate max-w-[180px]">
                {activeEntity.parentSubject.title}
              </span>
            </div>
          )}

          {activeEntity.provenanceSource && (
            <div className="p-2.5 bg-zinc-900/40 border border-zinc-800/60 rounded-xl flex items-center justify-between text-xs">
              <span className="text-zinc-400">Источник:</span>
              <span className="font-medium text-blue-300 truncate max-w-[180px]">
                {activeEntity.provenanceSource.title}
              </span>
            </div>
          )}

          {activeEntity.meta && Object.entries(activeEntity.meta).map(([k, v]) => (
            <div key={k} className="p-2.5 bg-zinc-900/40 border border-zinc-800/60 rounded-xl flex items-center justify-between text-xs">
              <span className="text-zinc-400 capitalize">{k.replace('_', ' ')}:</span>
              <span className="font-medium text-zinc-200 truncate max-w-[180px]">
                {String(v)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Футер: Быстрые действия */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/60 space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
          Действия
        </span>

        {activeEntity.onAskTutor && activeEntity.parentSubject && (
          <button
            onClick={() => {
              activeEntity.onAskTutor!(activeEntity.parentSubject!.id, activeEntity.title);
              closeInspector();
            }}
            className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
          >
            <MessageSquare size={14} />
            Спросить Тьютора по этой теме
          </button>
        )}

        {activeEntity.onOpenSubject && activeEntity.parentSubject && (
          <button
            onClick={() => {
              activeEntity.onOpenSubject!(activeEntity.parentSubject!.id);
              closeInspector();
            }}
            className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all"
          >
            <BookOpen size={14} />
            Открыть предмет
          </button>
        )}

        {activeEntity.onOpenSource && activeEntity.provenanceSource && (
          <button
            onClick={() => {
              activeEntity.onOpenSource!(activeEntity.provenanceSource!.title);
              closeInspector();
            }}
            className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all"
          >
            <ExternalLink size={14} />
            Перейти к первоисточнику
          </button>
        )}
      </div>
    </aside>
  );
};
