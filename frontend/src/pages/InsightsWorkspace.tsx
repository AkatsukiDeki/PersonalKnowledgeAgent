import React, { useEffect, useState } from 'react';
import { InsightCard } from '../components/insights/InsightCard';
import { EvidenceInspectorModal } from '../components/insights/EvidenceInspectorModal';
import { insightsApi, Insight } from '../api/insights';
import { Sparkles, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export function InsightsWorkspace() {
  const { t } = useLanguage();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [inspectPatternId, setInspectPatternId] = useState<string | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const data = await insightsApi.getInsights();
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

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await insightsApi.generateInsights();
      setTimeout(fetchInsights, 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 mb-8 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-fuchsia-400" /> 
            {t('insights.title')}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {t('insights.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/20 text-white px-4 py-2.5 rounded-xl font-medium text-xs transition-all shadow-lg shadow-indigo-500/20 disabled:shadow-none"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={1.5} />}
            {generating ? t('insights.syncing') : t('insights.generate')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/40 gap-3 font-mono text-xs">
            <Loader2 className="animate-spin text-fuchsia-400" size={16} /> Загрузка инсайтов...
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/40">
            <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 mb-4">
              <Sparkles size={22} strokeWidth={1.5} />
            </div>
            <p className="text-sm font-light text-white/80">{t('insights.noInsights')}</p>
            <p className="text-xs font-light text-white/40 mt-1">{t('insights.needMoreData')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {insights.map(insight => (
              <InsightCard
                key={insight.id}
                insight={insight}
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