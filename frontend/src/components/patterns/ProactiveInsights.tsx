import React, { useEffect, useState } from 'react';

interface Insight {
  id: string;
  title: string;
  description: string;
  evidence_summary: string;
  domains: string[];
  confidence: number;
  status: string;
}

export function ProactiveInsights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  const fetchInsights = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/insights/pending');
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
      }
    } catch (e) {
      console.error("Failed to fetch pending insights:", e);
    }
  };

  useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const handleAccept = async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/insights/${id}/accept`, { method: 'POST' });
      setInsights(insights.filter(i => i.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/insights/${id}/dismiss`, { method: 'POST' });
      setInsights(insights.filter(i => i.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  if (insights.length === 0 || !isVisible) return null;

  const insight = insights[0]; // Show one by one

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-zinc-900 border border-zinc-700 shadow-2xl rounded-xl overflow-hidden z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-indigo-600/10 border-b border-indigo-500/20 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400">💡</span>
          <h3 className="text-sm font-semibold text-indigo-300">Я заметил скрытую связь...</h3>
        </div>
        <button 
          onClick={() => setIsVisible(false)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg"
        >
          ×
        </button>
      </div>
      
      <div className="p-4 space-y-3">
        <h4 className="text-sm font-medium text-zinc-100 leading-tight">{insight.title}</h4>
        <p className="text-xs text-zinc-400 leading-relaxed">{insight.description}</p>
        
        <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
          <p className="text-[11px] text-zinc-500 italic">"{insight.evidence_summary}"</p>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {insight.domains.map(d => (
            <span key={d} className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
              {d}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-zinc-800">
        <button 
          onClick={() => handleDismiss(insight.id)}
          className="py-2.5 text-xs font-medium text-zinc-400 hover:text-red-400 hover:bg-red-400/5 transition-colors border-r border-zinc-800"
        >
          Dismiss
        </button>
        <button 
          onClick={() => handleAccept(insight.id)}
          className="py-2.5 text-xs font-medium text-emerald-500 hover:text-emerald-400 hover:bg-emerald-400/5 transition-colors"
        >
          Accept Pattern
        </button>
      </div>
    </div>
  );
}
