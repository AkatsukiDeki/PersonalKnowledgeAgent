import React, { useEffect, useState } from 'react';
import { InsightCard } from '../components/insights/InsightCard';
import { EvidenceInspectorModal } from '../components/insights/EvidenceInspectorModal';
import { insightsApi, Insight } from '../api/insights';
import { Sparkles, Loader2 } from 'lucide-react';

export function InsightsWorkspace() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [inspectPatternId, setInspectPatternId] = useState<string | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const data = await insightsApi.getPendingInsights();
      setInsights(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const handleAccept = async (id: string) => {
    try {
      await insightsApi.acceptInsight(id);
      setInsights(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await insightsApi.dismissInsight(id);
      setInsights(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await insightsApi.generateInsights();
      // Generation is async, so we just show a message or wait a bit and refresh
      setTimeout(fetchInsights, 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <div className="p-6 pb-4 border-b border-zinc-800 bg-zinc-900/30 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="text-indigo-400" size={24} /> 
            Insights Review Board
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Кандидатные паттерны и инсайты (L3), синтезированные на основе долговечных фактов
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generating ? 'Анализ графа...' : 'Сгенерировать'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500 gap-3">
            <Loader2 className="animate-spin" /> Загрузка инсайтов...
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <Sparkles size={48} className="mb-4 opacity-20" />
            <p>Нет новых инсайтов на ревью</p>
            <p className="text-sm mt-1">Попробуйте сгенерировать новые на основе последних знаний</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {insights.map(insight => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                onInspect={setInspectPatternId}
              />
            ))}
          </div>
        )}
      </div>

      <EvidenceInspectorModal
        patternId={inspectPatternId}
        onClose={() => setInspectPatternId(null)}
      />
    </div>
  );
}
