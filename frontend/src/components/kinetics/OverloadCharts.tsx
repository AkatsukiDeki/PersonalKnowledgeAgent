import React, { useEffect, useState } from 'react';
import { kineticsApi, OverloadAnalyticsResponse } from '../../api/kinetics';
import { Activity, Dumbbell, BarChart3, TrendingUp, Loader2 } from 'lucide-react';

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
  
  // Weekly tonnage aggregation
  const weeks = Array.from(new Set(data.weekly_tonnage.map(t => t.week_start))).sort();
  const muscleGroups = Array.from(new Set(data.weekly_tonnage.map(t => t.muscle_group)));
  
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
          <div className="relative w-full h-56">
             <svg viewBox={`0 0 ${Math.max(400, weeks.length * 60)} 200`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
               {/* Compute max total tonnage per week to scale */}
               {(() => {
                 const weeklyTotals = weeks.map(w => {
                   return data.weekly_tonnage.filter(t => t.week_start === w).reduce((acc, curr) => acc + curr.tonnage_kg, 0);
                 });
                 const maxTotal = Math.max(...weeklyTotals, 1000);
                 
                 return weeks.map((w, wIdx) => {
                   const weekData = data.weekly_tonnage.filter(t => t.week_start === w);
                   const xOffset = wIdx * (400 / Math.max(weeks.length, 5)) + 20;
                   const barWidth = Math.min(30, 300 / Math.max(weeks.length, 5));
                   
                   let currentY = 200;
                   return (
                     <g key={w}>
                       {weekData.map((d, i) => {
                         const barHeight = (d.tonnage_kg / maxTotal) * 180;
                         const mColor = muscleColors[muscleGroups.indexOf(d.muscle_group) % muscleColors.length];
                         const y = currentY - barHeight;
                         const rect = (
                           <rect 
                             key={d.muscle_group}
                             x={xOffset} 
                             y={y} 
                             width={barWidth} 
                             height={barHeight} 
                             fill={mColor} 
                             rx={i === weekData.length - 1 ? 4 : 0} // top rounding only
                           />
                         );
                         currentY = y;
                         return rect;
                       })}
                       <text x={xOffset + barWidth/2} y={currentY - 5} fill="#cbd5e1" fontSize="9" textAnchor="middle" fontWeight="bold">
                         {(weeklyTotals[wIdx]/1000).toFixed(1)}т
                       </text>
                       <text x={xOffset + barWidth/2} y={215} fill="#64748b" fontSize="8" textAnchor="middle">
                         {new Date(w).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                       </text>
                     </g>
                   );
                 });
               })()}
             </svg>
          </div>
        ) : (
          <div className="text-slate-500 text-xs italic">Нет данных о тоннаже</div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-8 border-t border-slate-800/60 pt-4">
          {muscleGroups.map((mg, i) => (
            <div key={mg} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: muscleColors[i % muscleColors.length] }}></div>
              <span className="text-[10px] text-slate-400">{mg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
