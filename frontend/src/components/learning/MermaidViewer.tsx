import React, { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'inherit',
  suppressErrorRendering: true,
  themeVariables: {
    primaryColor: '#6366f1',
    primaryTextColor: '#f8fafc',
    primaryBorderColor: '#818cf8',
    lineColor: '#94a3b8',
    secondaryColor: '#3b82f6',
    tertiaryColor: '#1e293b',
    background: '#090d16',
  }
});

interface MermaidViewerProps {
  chart: string;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ chart }) => {
  const uniqueId = useId().replace(/:/g, '_');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      const cleanChart = chart.trim();
      if (!cleanChart) return;

      try {
        const id = `mermaid_${uniqueId}_${Date.now()}`;
        const { svg: renderedSvg } = await mermaid.render(id, cleanChart);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Синтаксическая ошибка диаграммы');
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, uniqueId]);

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs font-mono">
        <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-amber-400/70">
              Схема не может быть отображена
            </div>
            <button 
              onClick={() => setShowSource(!showSource)}
              className="text-amber-500 hover:text-amber-400 transition-colors bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded"
            >
              {showSource ? 'Скрыть исходный код' : 'Показать исходный код диаграммы'}
            </button>
        </div>
        {showSource && (
          <pre className="overflow-x-auto text-zinc-400 text-[11px] bg-zinc-950 p-2 rounded-md border border-white/5"><code>{chart}</code></pre>
        )}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 flex items-center justify-center p-8 bg-zinc-900/40 rounded-xl border border-white/5 animate-pulse text-xs text-zinc-500">
        Рендеринг схемы архитектуры...
      </div>
    );
  }

  return (
    <div className="my-6 overflow-hidden rounded-xl border border-indigo-500/20 bg-zinc-950/60 p-4 shadow-lg">
      <div className="text-[10px] uppercase font-mono tracking-wider text-indigo-400 mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
        Архитектурная схема
      </div>
      <div 
        className="flex justify-center overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto" 
        dangerouslySetInnerHTML={{ __html: svg }} 
      />
    </div>
  );
};
