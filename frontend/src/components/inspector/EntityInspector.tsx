import React, { useEffect, useState } from 'react';
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
  Compass,
  Link2,
  Brain,
  HelpCircle,
  Loader2,
  Copy,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import clsx from 'clsx';
import { graphApi, GraphCopilotAction } from '../../api/graph';

const COPILOT_ACTIONS: { id: GraphCopilotAction; label: string; icon: React.ReactNode }[] = [
  { id: 'explain_connections', label: 'Связи', icon: <Link2 size={14} /> },
  { id: 'active_recall', label: 'Проверка', icon: <Brain size={14} /> },
  { id: 'find_blindspots', label: 'Пробелы', icon: <HelpCircle size={14} /> },
];

export const EntityInspector: React.FC = () => {
  const { activeEntity, isOpen, closeInspector } = useInspector();

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotAction, setCopilotAction] = useState<GraphCopilotAction | null>(null);
  const [copilotResult, setCopilotResult] = useState<string | null>(null);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  // Reset copilot state when entity changes
  useEffect(() => {
    setCopilotOpen(false);
    setCopilotResult(null);
    setCopilotError(null);
    setCopilotAction(null);
  }, [activeEntity?.id]);

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

  const handleCopilotAction = async (action: GraphCopilotAction) => {
    if (!activeEntity) return;
    try {
      setCopilotLoading(true);
      setCopilotAction(action);
      setCopilotError(null);
      setCopilotResult(null);
      const res = await graphApi.runCopilotAction(activeEntity.id, {
        action,
        node_type: activeEntity.type || 'unknown'
      });
      setCopilotResult(res.result_text);
    } catch (err: any) {
      setCopilotError(err.message || 'Ошибка Graph Copilot');
    } finally {
      setCopilotLoading(false);
    }
  };

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
          {activeEntity.meta?.superseded_by && (
            <div className="p-3 mb-2 bg-amber-950/40 border border-amber-900/60 rounded-xl text-xs text-amber-200/80">
              <span className="font-semibold text-amber-400 block mb-1">Заменено новым решением</span>
              {activeEntity.meta.superseded_by}
            </div>
          )}
          
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

        {/* Graph Copilot Section */}
        <div className="border border-indigo-500/20 rounded-xl overflow-hidden">
          <button
            onClick={() => setCopilotOpen(prev => !prev)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300">Graph Copilot</span>
            </div>
            {copilotOpen ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
          </button>

          {copilotOpen && (
            <div className="px-3.5 py-3 space-y-3 bg-zinc-950/50">
              <div className="flex gap-1.5">
                {COPILOT_ACTIONS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => handleCopilotAction(a.id)}
                    disabled={copilotLoading}
                    className={clsx(
                      "flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[10px] font-medium transition-all",
                      copilotAction === a.id
                        ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                        : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/50",
                      "disabled:opacity-50"
                    )}
                  >
                    {copilotLoading && copilotAction === a.id
                      ? <Loader2 size={14} className="animate-spin" />
                      : a.icon
                    }
                    {a.label}
                  </button>
                ))}
              </div>

              {copilotLoading && (
                <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs py-4">
                  <Loader2 size={14} className="animate-spin" />
                  Анализирую граф...
                </div>
              )}

              {copilotError && (
                <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                  {copilotError}
                </div>
              )}

              {copilotResult && !copilotLoading && (
                <div className="space-y-2">
                  <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/60 border border-zinc-800/50 rounded-lg p-3 max-h-[200px] overflow-y-auto">
                    {copilotResult}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(copilotResult)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium rounded-lg transition-colors ml-auto"
                  >
                    <Copy size={11} />
                    Копировать
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Футер: Быстрые действия */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/60 space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
          Действия
        </span>

        {activeEntity.onTracePath && (
          <button
            onClick={() => {
              activeEntity.onTracePath!();
              closeInspector();
            }}
            className="w-full py-2 px-3 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all mb-2"
          >
            <Compass size={14} />
            Трассировать путь знания
          </button>
        )}

        {activeEntity.meta?.superseded_by && activeEntity.onJumpToTargetNode && (
          <button
            onClick={() => {
              activeEntity.onJumpToTargetNode!(activeEntity.meta!.superseded_by);
            }}
            className="w-full py-2 px-3 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/50 text-amber-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all mb-2"
          >
            <Sparkles size={14} />
            Найти преемника ↗
          </button>
        )}

        {activeEntity.onOpenChat && activeEntity.meta?.conversationId && (
          <button
            onClick={() => {
              activeEntity.onOpenChat!(activeEntity.meta!.conversationId);
              closeInspector();
            }}
            className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all mb-2"
          >
            <MessageSquare size={14} />
            Открыть диалог
          </button>
        )}

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
