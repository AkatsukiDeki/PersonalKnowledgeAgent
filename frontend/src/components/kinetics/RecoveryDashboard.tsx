import React, { useEffect, useState } from 'react';
import { kineticsApi, RecoveryAnalyticsResponse } from '../../api/kinetics';
import { HeartPulse, Bed, Zap, Flame, Loader2, Activity, BatteryCharging, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export const RecoveryDashboard: React.FC = () => {
  const [data, setData] = useState<RecoveryAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Morning Log Modal State
  const [showLogModal, setShowLogModal] = useState(false);
  const [sleepHours, setSleepHours] = useState<number>(7.5);
  const [fatigueScore, setFatigueScore] = useState<number>(5);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = () => {
    setIsLoading(true);
    kineticsApi.getRecoveryAnalytics()
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveMorningLog = async () => {
    setIsSaving(true);
    try {
      await kineticsApi.saveBiometrics({ sleep_hours: sleepHours, fatigue_score: fatigueScore });
      setShowLogModal(false);
      fetchData(); // Refresh data
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!data || data.timeline.length === 0) {
    return <div className="text-slate-500 text-sm text-center py-10">Нет данных для дашборда восстановления</div>;
  }

  const score = data.current_recovery_score;
  let statusColor = 'text-emerald-400';
  let statusBg = 'bg-emerald-500/10 border-emerald-500/30';
  let statusText = 'Optimal Readiness';
  let StatusIcon = CheckCircle2;

  if (score < 60) {
    statusColor = 'text-rose-400';
    statusBg = 'bg-rose-500/10 border-rose-500/30';
    statusText = 'High Fatigue Risk';
    StatusIcon = AlertTriangle;
  } else if (score < 80) {
    statusColor = 'text-amber-400';
    statusBg = 'bg-amber-500/10 border-amber-500/30';
    statusText = 'Moderate Recovery';
    StatusIcon = Activity;
  }

  // Format data for Recharts
  const chartData = data.timeline.map(d => ({
    name: new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    Тоннаж: d.tonnage_kg / 1000, // in tons
    Сон: d.sleep_hours,
    'Калории (ккал/1000)': d.calories / 1000,
    recovery_score: d.recovery_score
  }));

  return (
    <div className="space-y-6">
      
      {/* Header and Recovery Score */}
      <div className={`p-5 rounded-xl border flex justify-between items-center ${statusBg}`}>
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full bg-slate-950/50 ${statusColor}`}>
            <HeartPulse className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-3xl font-black text-slate-100">{score}%</h2>
              <span className={`text-xs font-bold px-2 py-1 rounded-full bg-slate-950/50 flex items-center gap-1 ${statusColor}`}>
                <StatusIcon className="w-3 h-3" /> {statusText}
              </span>
            </div>
            <div className="text-sm text-slate-400 mt-1">Индекс восстановления ЦНС и метаболизма</div>
          </div>
        </div>
        
        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors"
        >
          <BatteryCharging className="w-4 h-4" />
          Зафиксировать утро
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#030712] p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-2">
            <Bed className="w-4 h-4 text-indigo-400" /> СРЕДНИЙ СОН (14 дн)
          </div>
          <div className="text-2xl font-black text-slate-200">{data.average_sleep} ч</div>
        </div>
        <div className="bg-[#030712] p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-2">
            <Flame className="w-4 h-4 text-amber-400" /> СРЕДНИЕ КАЛОРИИ
          </div>
          <div className="text-2xl font-black text-slate-200">{data.average_calories} <span className="text-sm text-slate-500 font-normal">ккал</span></div>
        </div>
        <div className="bg-[#030712] p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-2">
            <Zap className="w-4 h-4 text-cyan-400" /> ТОННАЖ (14 дн)
          </div>
          <div className="text-2xl font-black text-slate-200">{(data.total_tonnage/1000).toFixed(1)} <span className="text-sm text-slate-500 font-normal">тонн</span></div>
        </div>
      </div>

      {/* Combined Chart */}
      <div className="bg-[#030712] border border-slate-800 rounded-xl p-4 shadow-xl">
        <h3 className="font-bold text-slate-200 mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          Стресс vs Восстановление (14 дней)
        </h3>
        
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: -15, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickMargin={8} />
              
              {/* Left Axis: Tonnage */}
              <YAxis yAxisId="left" stroke="#06b6d4" fontSize={10} tickFormatter={(v) => `${v}т`} />
              
              {/* Right Axis: Sleep & Cals */}
              <YAxis yAxisId="right" orientation="right" stroke="#818cf8" fontSize={10} />
              
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                itemStyle={{ fontSize: '12px' }}
                labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}
              />

              {/* Tonnage Bars (Stress) */}
              <Bar yAxisId="left" dataKey="Тоннаж" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={20}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.recovery_score < 60 ? '#f43f5e' : '#06b6d4'} opacity={0.8} />
                ))}
              </Bar>

              {/* Sleep Line (Recovery) */}
              <Line yAxisId="right" type="monotone" dataKey="Сон" stroke="#818cf8" strokeWidth={3} dot={{ r: 4, fill: '#0f172a', strokeWidth: 2 }} />
              
              {/* Calories Line (Recovery) */}
              <Line yAxisId="right" type="monotone" dataKey="Калории (ккал/1000)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex justify-center gap-6 mt-4">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-cyan-500 rounded-sm"></div><span className="text-xs text-slate-400">Тоннаж (Стресс)</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><span className="text-xs text-slate-400">Сон (Восстановление)</span></div>
          <div className="flex items-center gap-2"><div className="w-4 h-1 border-t-2 border-dashed border-amber-500"></div><span className="text-xs text-slate-400">Калории</span></div>
        </div>
      </div>

      {/* Morning Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800/50 p-4 border-b border-slate-700">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <BatteryCharging className="w-5 h-5 text-emerald-400" />
                Утренний чек-ин
              </h3>
            </div>
            
            <div className="p-5 space-y-6">
              {/* Sleep Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-3">СКОЛЬКО ЧАСОВ СПАЛИ?</label>
                <div className="flex justify-between gap-2">
                  {[6.0, 6.5, 7.0, 7.5, 8.0, 8.5].map(val => (
                    <button
                      key={val}
                      onClick={() => setSleepHours(val)}
                      className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors border ${
                        sleepHours === val 
                          ? 'bg-indigo-600 border-indigo-500 text-white' 
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fatigue Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-3">САМОЧУВСТВИЕ (1 - Свеж, 10 - Разбит)</label>
                <div className="flex justify-between gap-1">
                  {[1, 3, 5, 7, 9].map(val => (
                    <button
                      key={val}
                      onClick={() => setFatigueScore(val)}
                      className={`flex-1 py-3 text-lg rounded-md transition-colors border flex justify-center items-center ${
                        fatigueScore === val 
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-400' 
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                      }`}
                    >
                      {val === 1 && '🔋'}
                      {val === 3 && '🙂'}
                      {val === 5 && '😐'}
                      {val === 7 && '🥱'}
                      {val === 9 && '💀'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3">
              <button 
                onClick={() => setShowLogModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Отмена
              </button>
              <button 
                onClick={handleSaveMorningLog}
                disabled={isSaving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
