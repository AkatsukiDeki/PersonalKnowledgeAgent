import React, { useState } from 'react';
import { Link2, Brain, HelpCircle, Loader2, X, Copy, Sparkles } from 'lucide-react';
import { graphApi, GraphCopilotAction } from '../../api/graph';

interface Props {
  nodeId: string;
  nodeLabel: string;
  nodeGroup: string;
  nodeType?: 'node' | 'edge';
  onClose: () => void;
}

export function GraphCopilotPanel({ nodeId, nodeLabel, nodeGroup, nodeType = 'node', onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<GraphCopilotAction | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableActions: { id: GraphCopilotAction; label: string; icon: React.ReactNode; description: string }[] = [
    {
      id: 'explain_connections',
      label: nodeType === 'edge' ? 'Анализ связи' : 'Анализ связей',
      icon: <Link2 size={16} />,
      description: nodeType === 'edge' ? 'Объяснить логическую связь' : 'Почему этот узел связан с соседними'
    },
    {
      id: 'active_recall',
      label: nodeType === 'edge' ? 'Проверка связи' : 'Проверка знаний',
      icon: <Brain size={16} />,
      description: nodeType === 'edge' ? 'Вопросы на понимание связи' : 'Вопросы для самопроверки'
    },
    ...(nodeType === 'node' ? [{
      id: 'find_blindspots' as GraphCopilotAction,
      label: 'Найти пробелы',
      icon: <HelpCircle size={16} />,
      description: 'Чего не хватает в базе знаний'
    }] : [])
  ];

  const handleAction = async (action: GraphCopilotAction) => {
    try {
      setLoading(true);
      setActiveAction(action);
      setError(null);
      setResult(null);
      const res = await graphApi.runCopilotAction(nodeId, {
        action,
        node_type: nodeType === 'edge' ? 'edge' : (nodeGroup || 'unknown')
      });
      setResult(res.result_text);
    } catch (err: any) {
      setError(err.message || 'Ошибка при обращении к Graph Copilot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute top-20 right-4 w-[380px] bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-right fade-in duration-300 flex flex-col max-h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-500/20 p-1.5 rounded-lg">
            <Sparkles size={16} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Graph Copilot</h3>
            <p className="text-[11px] text-zinc-500 truncate max-w-[200px]" title={nodeLabel}>
              {nodeLabel}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/5"
        >
          <X size={16} />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="px-3 py-3 flex gap-2 border-b border-zinc-800/30 shrink-0">
        {availableActions.map(a => (
          <button
            key={a.id}
            onClick={() => handleAction(a.id)}
            disabled={loading}
            className={`flex-1 flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl text-[11px] font-medium transition-all ${
              activeAction === a.id
                ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200 border border-transparent'
            } disabled:opacity-50`}
            title={a.description}
          >
            {loading && activeAction === a.id ? <Loader2 size={16} className="animate-spin" /> : a.icon}
            <span className="leading-tight text-center">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Result Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-[80px]">
        {!result && !error && !loading && (
          <div className="text-center text-zinc-600 text-xs py-6">
            Выберите действие для анализа узла
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs py-8">
            <Loader2 size={16} className="animate-spin" />
            <span>Анализирую граф...</span>
          </div>
        )}

        {error && (
          <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {error}
          </div>
        )}

        {result && !loading && (
          <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {result}
          </div>
        )}
      </div>

      {/* Footer with copy */}
      {result && !loading && (
        <div className="px-4 py-2.5 border-t border-zinc-800/50 flex justify-end shrink-0">
          <button
            onClick={() => navigator.clipboard.writeText(result)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-medium rounded-lg transition-colors"
          >
            <Copy size={12} />
            Копировать
          </button>
        </div>
      )}
    </div>
  );
}
