import React, { useEffect, useState } from 'react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';
import { 
  Cpu, 
  BrainCircuit, 
  Activity, 
  Flame, 
  Compass, 
  Sparkles, 
  Copy, 
  Check 
} from 'lucide-react';

interface TelemetryData {
  radar_concepts: { subject: string; mastery: number; fullMark: number }[];
  cognitive_metrics: {
    retention_rate_pct: number;
    avg_response_time_ms: number;
    avg_cns_score: number;
  };
  execution_velocity: {
    domain_name: string;
    planned_hours: number;
    actual_hours: number;
  }[];
  agent_snapshot: string;
  insights?: {
    blind_spot: string;
    optimum: string;
    action: string;
  };
}

export const TwinWorkspace: React.FC = () => {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/v1/twin/telemetry')
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Ошибка загрузки телеметрии двойника:', err);
        setLoading(false);
      });
  }, []);

  const handleCopySnapshot = () => {
    if (!data?.agent_snapshot) return;
    navigator.clipboard.writeText(data.agent_snapshot);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-neutral-950 text-white/50 space-y-4">
        <Cpu className="w-12 h-12 animate-pulse text-indigo-500" />
        <div className="font-mono text-sm tracking-widest uppercase">ИНИЦИАЛИЗАЦИЯ ЦИФРОВОГО ДВОЙНИКА...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 text-white overflow-y-auto">
      {/* Шапка вкладки */}
      <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-neutral-950/80 backdrop-blur-md z-10">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <Cpu className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ЦИФРОВОЙ ДВОЙНИК ONLINE</h1>
            <p className="text-white/40 text-sm mt-1">Объективная телеметрия когнитивного ресурса, навыков и исполнения</p>
          </div>
        </div>

        {/* Быстрые биометрические индикаторы */}
        <div className="flex space-x-4">
          <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/5 flex items-center space-x-3">
            <Activity className="w-5 h-5 text-emerald-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">CNS Baseline</span>
              <span className="text-sm font-mono"><strong>{data?.cognitive_metrics?.avg_cns_score?.toFixed(1) || '8.5'}</strong>/10</span>
            </div>
          </div>
          <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/5 flex items-center space-x-3">
            <BrainCircuit className="w-5 h-5 text-purple-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Retention</span>
              <span className="text-sm font-mono"><strong>{data?.cognitive_metrics?.retention_rate_pct || 0}</strong>%</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Верхняя сетка: Радар знаний + Выработка часов */}
        {/* Карточка 1: Радар плотности знаний */}
        <section className="bg-white/5 border border-white/5 rounded-2xl p-6 flex flex-col">
          <h2 className="text-lg font-semibold flex items-center space-x-2 mb-6">
            <Compass className="w-5 h-5 text-indigo-400" />
            <span>Радар компетенций (Knowledge Surface)</span>
          </h2>
          
          <div className="flex-1 min-h-[300px]">
            {data?.radar_concepts && data.radar_concepts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data.radar_concepts} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Освоение"
                    dataKey="mastery"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/30">
                <p>Недостаточно данных для построения графа</p>
                <p className="text-xs mt-2">Пройдите несколько сессий SM-2 / Active Recall</p>
              </div>
            )}
          </div>
        </section>

        {/* Карточка 2: Execution Velocity (План vs Факт) */}
        <section className="bg-white/5 border border-white/5 rounded-2xl p-6 flex flex-col">
          <h2 className="text-lg font-semibold flex items-center space-x-2 mb-6">
            <Flame className="w-5 h-5 text-orange-400" />
            <span>Фактическая выработка (План vs Факт)</span>
          </h2>
          
          <div className="flex-1 min-h-[300px]">
            {data?.execution_velocity && data.execution_velocity.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.execution_velocity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="domain_name" stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} />
                  <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ backgroundColor: '#171717', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="planned_hours" name="План (ч)" fill="rgba(255,255,255,0.2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual_hours" name="Факт (ч)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-white/30">
                <p>Нет завершенных задач в расписании</p>
              </div>
            )}
          </div>
        </section>

        {/* Кросс-доменный синтез (Insights) */}
        {data?.insights && (
          <section className="col-span-1 lg:col-span-2 bg-gradient-to-br from-neutral-900 to-neutral-800 border border-white/5 rounded-2xl p-6">
            <div className="flex items-center mb-4">
              <BrainCircuit className="w-5 h-5 text-fuchsia-400 mr-2" />
              <h2 className="text-lg font-semibold">Инженерный диагноз / Кросс-доменный синтез</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-black/30 border border-white/5 rounded-xl p-4 relative group">
                <h3 className="text-sm font-semibold text-rose-400 mb-2 flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="mr-2">🎯</span> Зона слепого пятна
                  </div>
                  <button 
                    onClick={() => {
                      const topic = data.radar_concepts[data.radar_concepts.length - 1]?.subject || 'теме';
                      window.location.href = `/?q=${encodeURIComponent(`Разложи подробно, из каких конкретно метрик и сессий сформирован вывод про [${topic}]?`)}`;
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] uppercase tracking-wider text-white/50 hover:text-white/90 bg-white/5 px-2 py-1 rounded"
                  >
                    В чат ↗
                  </button>
                </h3>
                <p className="text-sm text-white/70 leading-relaxed">{data.insights.blind_spot}</p>
              </div>
              
              <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center">
                  <span className="mr-2">⚡</span> Точка оптимума
                </h3>
                <p className="text-sm text-white/70 leading-relaxed">{data.insights.optimum}</p>
              </div>
              
              <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center">
                  <span className="mr-2">🛠</span> Корректирующее действие
                </h3>
                <p className="text-sm text-white/70 leading-relaxed">{data.insights.action}</p>
              </div>
            </div>
          </section>
        )}

        {/* Нижняя карточка: Контекстный снимок для Агента */}
        <section className="col-span-1 lg:col-span-2 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 border border-indigo-500/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span>Системный контекстный снимок (Agent Persona Prompt)</span>
            </h2>
            <button 
              onClick={handleCopySnapshot}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                copied 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10 hover:text-white'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'СКОПИРОВАНО' : 'СКОПИРОВАТЬ ПРОМПТ'}</span>
            </button>
          </div>
          
          <div className="bg-black/40 border border-white/5 rounded-xl p-5 font-mono text-sm leading-relaxed text-indigo-200/80">
            {data?.agent_snapshot || "Снимок формируется..."}
          </div>
        </section>
      </main>
    </div>
  );
};

export default TwinWorkspace;
