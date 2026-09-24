import React, { useEffect, useState } from 'react';
import { kineticsApi, OverloadAnalyticsResponse } from '../../api/kinetics';
import { Activity, Dumbbell, BarChart3, TrendingUp, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export const OverloadCharts: React.FC = () => {
  const [data, setData] = useState<OverloadAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExIdx, setSelectedExIdx] = useState(0);

  useEffect(() => {
    kineticsApi.getOverloadAnalytics()
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (!data || (data.one_rm_top_exercises.length === 0 && data.weekly_tonnage.length === 0)) {
    return <div className="text-slate-500 text-sm text-center py-10">Нет данных для аналитики прогрессивной перегрузки</div>;
  }

  const selectedExercise = data.one_rm_top_exercises[selectedExIdx];
  const rmHistory = selectedExercise?.history || [];
  
  // Line chart scale
  const rmValues = rmHistory.map(h => h.one_rm_kg);
  const minRm = Math.max(0, Math.min(...rmValues) - 5);
  const maxRm = Math.max(...rmValues) + 5;
  
// Normalize muscle groups (lowercase, map aliases to standard names)
  const normalizeMuscle = (m: string) => {
    const s = m.toLowerCase().trim();
    if (s.includes('бедро') || s.includes('бедра') || s.includes('ноги')) return 'Ноги';
    if (s.includes('грудь') || s.includes('грудные')) return 'Грудь';
    if (s.includes('спина') || s.includes('широчайшие') || s.includes('лопатки')) return 'Спина';
    if (s.includes('плечи') || s.includes('дельты')) return 'Плечи';
    if (s.includes('бицепс')) return 'Бицепс';
    if (s.includes('трицепс')) return 'Трицепс';
    if (s.includes('кор') || s.includes('пресс')) return 'Кор';
    if (s.includes('шея')) return 'Шея';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const normalizedTonnage = data.weekly_tonnage.reduce((acc, curr) => {
    const norm = normalizeMuscle(curr.muscle_group);
    const existing = acc.find(t => t.week_start === curr.week_start && t.muscle_group === norm);
    if (existing) {
      existing.tonnage_kg += curr.tonnage_kg;
    } else {
      acc.push({ ...curr, muscle_group: norm });
    }
    return acc;
  }, [] as typeof data.weekly_tonnage);

  // Weekly tonnage aggregation
  const weeks = Array.from(new Set(normalizedTonnage.map(t => t.week_start))).sort();
  const muscleGroups = Array.from(new Set(normalizedTonnage.map(t => t.muscle_group)));
  
  // Pastel colors for different muscle groups
  const muscleColors = ['#06b6d4', '#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

  return (
    <div className="space-y-6">
      
      {/* 1RM Line Chart */}
      <div className="bg-[#030712] border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-200">Динамика 1RM (Эпли)</h3>
          </div>
          {data.one_rm_top_exercises.length > 0 && (
            <select
              value={selectedExIdx}
              onChange={e => setSelectedExIdx(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1 outline-none focus:border-cyan-500"
            >
              {data.one_rm_top_exercises.map((ex, idx) => (
                <option key={idx} value={idx}>{ex.exercise_name}</option>
              ))}
            </select>
          )}
        </div>

        {rmHistory.length > 1 ? (
          <div className="relative w-full h-44 px-2">
            <svg viewBox="0 0 400 120" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* Сетка */}
              <line x1="10" y1="10" x2="390" y2="10" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="10" y1="45" x2="390" y2="45" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="10" y1="80" x2="390" y2="80" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />

              {/* Траектория 1RM */}
              <path
                d={`M ${rmHistory.map((h, i) => {
                  const x = 20 + (i / (rmHistory.length - 1)) * 360;
                  const range = maxRm - minRm || 1;
                  const y = 85 - ((h.one_rm_kg - minRm) / range) * 72;
                  return `${x},${y}`;
                }).join(' L ')}`}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.5"
                filter="url(#glow)"
              />

              {/* Точки и подписи */}
              {rmHistory.map((h, i) => {
                const x = 20 + (i / (rmHistory.length - 1)) * 360;
                const range = maxRm - minRm || 1;
                const y = 85 - ((h.one_rm_kg - minRm) / range) * 72;
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r="4" fill="#030712" stroke="#06b6d4" strokeWidth="2" />
                    <text x={x} y={y - 8} fill="#38bdf8" fontSize="10" textAnchor="middle" fontWeight="bold">
                      {h.one_rm_kg.toFixed(1)}
                    </text>
                    <text x={x} y={110} fill="#64748b" fontSize="9" textAnchor="middle">
                      {new Date(h.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div className="text-slate-500 text-xs italic py-6 text-center">
            Недостаточно данных для графика (нужно хотя бы 2 тренировки)
          </div>
        )}
      </div>

      {/* Weekly Tonnage Bar Chart */}

      <div className="bg-[#030712] border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-bold text-slate-200">Недельный рабочий тоннаж</h3>
        </div>

        {weeks.length > 0 ? (
          <div className="w-full h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={weeks.map(w => {
                  const weekData = normalizedTonnage.filter(t => t.week_start === w);
                  const obj: any = { week: new Date(w).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) };
                  weekData.forEach(d => {
                    obj[d.muscle_group] = Number((d.tonnage_kg / 1000).toFixed(1));
                  });
                  return obj;
                })} 
                margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="week" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}т`} />
                <Tooltip 
                  cursor={{ fill: '#1e293b', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }}
                  itemStyle={{ fontSize: '12px' }}
                  formatter={(value: any) => [`${value} т`, '']}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
                {muscleGroups.map((m, i) => (
                  <Bar 
                    key={m} 
                    dataKey={m} 
                    stackId="a" 
                    fill={muscleColors[i % muscleColors.length]} 
                    maxBarSize={40}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-slate-500 text-xs italic">Нет данных о тоннаже</div>
        )}


      </div>
    </div>
  );
};
