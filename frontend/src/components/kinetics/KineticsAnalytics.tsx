
interface Milestone {
  phase: string;
  targetDate: string;
  targetWeight: number;
  targetFatPct: number;
  deltaKg: string;
  status: 'active' | 'pending' | 'completed';
  focus: string;
  color: string;
}

const milestones: Milestone[] = [
  {
    phase: 'Этап 1: Адаптация',
    targetDate: '29.10.2026',
    targetWeight: 97.0,
    targetFatPct: 26.5,
    deltaKg: '-3.7 кг',
    status: 'active',
    focus: 'Слив отека, калибровка техники, ЦНС ≤ 5',
    color: 'cyan',
  },
  {
    phase: 'Этап 2: Жиросжигание',
    targetDate: '10.12.2026',
    targetWeight: 93.5,
    targetFatPct: 23.5,
    deltaKg: '-3.5 кг',
    status: 'pending',
    focus: 'Тоннаж 19–20т, плотность домашних тренировок',
    color: 'indigo',
  },
  {
    phase: 'Этап 3: Двузначный вес',
    targetDate: '04.02.2027',
    targetWeight: 90.0,
    targetFatPct: 20.5,
    deltaKg: '-3.5 кг',
    status: 'pending',
    focus: 'Рост относительной силы, подтягивания 12+',
    color: 'violet',
  },
  {
    phase: 'Этап 4: Рельеф',
    targetDate: '18.03.2027',
    targetWeight: 87.0,
    targetFatPct: 17.5,
    deltaKg: '-3.0 кг',
    status: 'pending',
    focus: 'Детализация верха, ротаторы, сухой кор',
    color: 'amber',
  },
  {
    phase: 'ФИНАЛ: Рекомпозиция',
    targetDate: '22.04.2027',
    targetWeight: 85.0,
    targetFatPct: 15.0,
    deltaKg: '-2.0 кг',
    status: 'pending',
    focus: 'Ключевая цель: 85 кг при 15% жира',
    color: 'emerald',
  },
];

// Плановая траектория для пунктирной линии цели
const plannedTrajectory = [
  { x: 20, y: 40, w: 100.7, label: 'Сейчас' },
  { x: 100, y: 55, w: 99.0, label: '' },
  { x: 170, y: 70, w: 97.0, label: 'Эт.1\n97кг' },
  { x: 250, y: 88, w: 93.5, label: 'Эт.2\n93.5кг' },
  { x: 330, y: 102, w: 90.0, label: 'Эт.3\n90кг' },
  { x: 400, y: 113, w: 87.0, label: 'Эт.4\n87кг' },
  { x: 480, y: 122, w: 85.0, label: 'ЦЕЛЬ\n85кг' },
];

const statusColors: Record<string, string> = {
  cyan: 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_14px_rgba(6,182,212,0.2)]',
  indigo: 'border-indigo-500/50 bg-indigo-950/20',
  violet: 'border-violet-500/50 bg-violet-950/20',
  amber: 'border-amber-500/50 bg-amber-950/20',
  emerald: 'border-emerald-500/60 bg-emerald-950/20',
};

const textColors: Record<string, string> = {
  cyan: 'text-cyan-300',
  indigo: 'text-indigo-300',
  violet: 'text-violet-300',
  amber: 'text-amber-300',
  emerald: 'text-emerald-300',
};

const badgeColors: Record<string, string> = {
  cyan: 'bg-cyan-950 text-cyan-400 border-cyan-800',
  indigo: 'bg-indigo-950 text-indigo-400 border-indigo-800',
  violet: 'bg-violet-950 text-violet-400 border-violet-800',
  amber: 'bg-amber-950 text-amber-400 border-amber-800',
  emerald: 'bg-emerald-950 text-emerald-400 border-emerald-800',
};

const dotColors: Record<string, string> = {
  cyan: '#22d3ee',
  indigo: '#818cf8',
  violet: '#a78bfa',
  amber: '#fbbf24',
  emerald: '#34d399',
};

const phaseStroke: Record<string, string> = {
  cyan: '#06b6d4',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  amber: '#f59e0b',
  emerald: '#10b981',
};

import React, { useState, useEffect } from 'react';
import { TrendingDown, Award, Zap, BarChart2, Target, CheckCircle2, Clock, Flame } from 'lucide-react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area } from 'recharts';
import { BiometricsLog, kineticsApi } from '../../api/kinetics';

export const KineticsAnalytics: React.FC<{ biometrics: BiometricsLog[] }> = ({ biometrics }) => {
  const [hoveredMilestone, setHoveredMilestone] = useState<number | null>(null);
  const [actualProgressData, setActualProgressData] = useState<any[]>([]);
  const latestBio = biometrics.length > 0 ? biometrics[0] : null;

  useEffect(() => {
    kineticsApi.getAnalyticsCorrelation(8)
      .then(data => {
        if (data && data.length > 0) {
          setActualProgressData(data);
        } else {
          // Дефолтный старт, если база пустая
          setActualProgressData([
            { week: 'Нед 1', fatPct: 29.4, tonnage: 0, deficit: 0 }
          ]);
        }
      })
      .catch(err => console.error('Ошибка загрузки аналитики', err));
  }, []);

  const weight = Number(latestBio?.weight || latestBio?.weight_kg || 100.7);
  const muscleKg = Number(latestBio?.skeletal_muscle_kg || latestBio?.muscle_kg || 41.0);
  const fatKg = Number(latestBio?.fat_mass_kg || 29.6);
  const fatPct = latestBio?.body_fat_percentage ? Number(latestBio.body_fat_percentage) : 29.4;

  // Прогресс к цели (85 кг)
  const startWeight = 100.7;
  const goalWeight = 85.0;
  const progressPct = Math.round(((startWeight - weight) / (startWeight - goalWeight)) * 100);

  // SVG helper: build smooth polyline from points
  const buildPath = (pts: typeof plannedTrajectory) =>
    pts.reduce((acc, pt, i) =>
      i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');

  return (
    <div className="h-full w-full bg-[#030712] border border-cyan-950/80 rounded-xl p-5 flex flex-col gap-4 font-mono text-slate-200 overflow-y-auto custom-scrollbar">
      {/* Шапка */}
      <div className="flex justify-between items-center border-b border-cyan-950 pb-3 shrink-0">
        <div className="flex items-center gap-2 text-cyan-400 font-bold">
          <BarChart2 className="w-5 h-5" />
          <span>ДИНАМИКА РЕКОМПОЗИЦИИ И СИЛОВОГО ОБЪЕМА</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-slate-400">
            ПРОГРЕСС К ЦЕЛИ:{' '}
            <span className="text-cyan-400 font-bold">{progressPct > 0 ? progressPct : 0}%</span>
          </div>
          <div className="text-slate-400">
            ФИНАЛ:{' '}
            <span className="text-emerald-400 font-bold">22.04.2027 // 85.0 КГ / 15%</span>
          </div>
        </div>
      </div>

      {/* KPI карточки */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        <div className="bg-[#090d16] border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">ТЕКУЩИЙ ВЕС</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {weight.toFixed(1)} <span className="text-xs text-slate-500">кг</span>
          </div>
          <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1">
            <TrendingDown className="w-3 h-3" />
            до цели: {(weight - goalWeight).toFixed(1)} кг
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
            <div
              style={{ width: `${Math.min(Math.max(progressPct, 0), 100)}%` }}
              className="h-full bg-cyan-500 transition-all"
            />
          </div>
        </div>

        <div className="bg-[#090d16] border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">МЫШЕЧНАЯ МАССА</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">
            {muscleKg.toFixed(1)} <span className="text-xs text-slate-500">кг</span>
          </div>
          <div className="text-[10px] text-cyan-500 mt-1">Цель удержания: ≥ 40.8 кг</div>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
            <div style={{ width: `${Math.min((muscleKg / 40.8) * 100, 100)}%` }} className="h-full bg-cyan-500" />
          </div>
        </div>

        <div className="bg-[#090d16] border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400 flex items-center gap-1">
            ЖИРОВАЯ МАССА <Flame className="w-3 h-3 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {fatKg.toFixed(1)} <span className="text-xs text-slate-500">кг</span>
          </div>
          <div className="text-[10px] text-amber-500 mt-1">
            {fatPct.toFixed(1)}% → цель 15.0%
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
            <div
              style={{ width: `${Math.min(((fatPct - 15) / (29.4 - 15)) * 100, 100)}%` }}
              className="h-full bg-amber-500"
            />
          </div>
        </div>

        <div className="bg-[#090d16] border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">ДНЕЙ ДО ФИНАЛА</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">
            217 <span className="text-xs text-slate-500">дн.</span>
          </div>
          <div className="text-[10px] text-indigo-300 mt-1">≈ 7 месяцев (до 22.04.2027)</div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Темп: −0.5..0.7 кг/нед
          </div>
        </div>
      </div>

      {/* RECHARTS: Фактическая динамика (Жир, Тоннаж, Дефицит) */}
      <div className="bg-[#090d16] border border-slate-800 rounded-xl p-4 shrink-0">
        <div className="flex justify-between items-center text-xs text-slate-400 mb-3">
          <span className="font-bold text-slate-300">ФАКТИЧЕСКАЯ ДИНАМИКА // КАЛИПЕРОМЕТРИЯ И ОБЪЕМЫ</span>
        </div>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={actualProgressData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="week" stroke="#475569" fontSize={10} tickMargin={8} />
              
              <YAxis yAxisId="left" stroke="#06b6d4" fontSize={10} domain={[10, 25]} tickFormatter={(v) => `${v}т`} />
              <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" fontSize={10} domain={[25, 30]} tickFormatter={(v) => `${v}%`} />
              
              <Tooltip
                contentStyle={{ backgroundColor: '#030712', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              
              {/* Дефицит - Area (заполняющий фон) */}
              <Area yAxisId="left" type="monotone" dataKey="deficit" fill="#818cf8" stroke="none" opacity={0.1} name="Дефицит (ккал)" />
              
              {/* Тоннаж - Столбцы */}
              <Bar yAxisId="left" dataKey="tonnage" barSize={20} fill="#06b6d4" name="Тоннаж (т)" radius={[2, 2, 0, 0]} />
              
              {/* Жир - Линия */}
              <Line yAxisId="right" type="monotone" dataKey="fatPct" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#030712', strokeWidth: 2 }} name="Жир (Jackson-Pollock %)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SVG График с плановой траекторией */}
      <div className="bg-[#090d16] border border-slate-800 rounded-xl p-4 shrink-0">
        <div className="flex justify-between items-center text-xs text-slate-400 mb-3">
          <span className="font-bold text-slate-300">КРИВАЯ МАССЫ ТЕЛА // ПЛАНОВАЯ ТРАЕКТОРИЯ</span>
          <div className="flex gap-3 items-center">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-cyan-400 inline-block rounded" />
              Факт
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block"
                style={{
                  width: 20,
                  height: 2,
                  backgroundImage: 'repeating-linear-gradient(to right, #6366f1 0, #6366f1 4px, transparent 4px, transparent 8px)',
                }}
              />
              План
            </span>
          </div>
        </div>

        <svg viewBox="0 0 500 160" className="w-full h-40 overflow-visible">
          {/* Горизонтальные риски */}
          {[0, 40, 80, 120].map((y) => (
            <line key={y} x1="0" y1={y} x2="500" y2={y} stroke="#1e293b" strokeWidth="1" strokeDasharray="3,3" />
          ))}
          {/* Y-лейблы */}
          {[
            { y: 5, label: '100кг' },
            { y: 45, label: '95кг' },
            { y: 85, label: '90кг' },
            { y: 125, label: '85кг' },
          ].map((l) => (
            <text key={l.y} x="4" y={l.y} fill="#475569" fontSize="8" fontFamily="monospace">
              {l.label}
            </text>
          ))}

          {/* Плановая траектория (пунктир, indigo) */}
          <path
            d={buildPath(plannedTrajectory)}
            fill="none"
            stroke="#6366f1"
            strokeWidth="1.8"
            strokeDasharray="6,4"
            opacity="0.7"
          />

          {/* Фактическая линия (cyan) — короткая: только реальные данные */}
          <path
            d="M 20 40 Q 150 44 250 48"
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2.5"
          />

          {/* Зелёная целевая горизонталь */}
          <line x1="0" y1="122" x2="500" y2="122" stroke="#10b981" strokeWidth="1" strokeDasharray="4,3" opacity="0.5" />
          <text x="420" y="118" fill="#10b981" fontSize="8" fontFamily="monospace" opacity="0.8">85кг (цель)</text>

          {/* Точки плановой траектории */}
          {plannedTrajectory.map((pt, i) => {
            const ms = milestones[i - 2];
            const col = ms ? dotColors[ms.color] : '#22d3ee';
            return (
              <g key={i}>
                <circle cx={pt.x} cy={pt.y} r={i === 0 ? 5 : 4} fill="#030712" stroke={col} strokeWidth="2" />
                {i >= 2 && (
                  <text x={pt.x - 12} y={pt.y - 10} fill="#64748b" fontSize="8" fontFamily="monospace">
                    {pt.w}кг
                  </text>
                )}
                {i === 0 && (
                  <text x={pt.x - 8} y={pt.y - 10} fill="#22d3ee" fontSize="8" fontFamily="monospace">
                    {pt.w}кг
                  </text>
                )}
              </g>
            );
          })}

          {/* Вертикальные маркеры этапов */}
          {[
            { x: 170, label: 'Эт.1', date: 'Окт.26' },
            { x: 250, label: 'Эт.2', date: 'Дек.26' },
            { x: 330, label: 'Эт.3', date: 'Фев.27' },
            { x: 400, label: 'Эт.4', date: 'Мар.27' },
            { x: 480, label: 'ФИНАЛ', date: 'Апр.27' },
          ].map((v, i) => (
            <g key={i}>
              <line x1={v.x} y1="0" x2={v.x} y2="140" stroke="#1e293b" strokeWidth="1" strokeDasharray="2,4" />
              <text x={v.x - 10} y="152" fill="#475569" fontSize="8" fontFamily="monospace">{v.date}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* ДОРОЖНАЯ КАРТА ЦЕЛЕЙ */}
      <div className="bg-[#090d16] border border-slate-800 rounded-xl p-4 shrink-0">
        <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
          <span className="text-xs font-bold text-cyan-300 tracking-wider flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-400" />
            КОНТРОЛЬНЫЕ ВЕХИ И ПРОМЕЖУТОЧНЫЕ ЦЕЛИ
          </span>
          <span className="text-[10px] text-slate-400">
            ОБЩИЙ СБРОС ЖИРА:{' '}
            <span className="text-amber-400 font-bold">≈ −16.8 КГ</span>
            {' | '}ГОРИЗОНТ:{' '}
            <span className="text-cyan-400 font-bold">28–30 НЕДЕЛЬ</span>
          </span>
        </div>

        {/* Соединительная линия прогресса */}
        <div className="relative flex items-center mb-4 px-4">
          <div className="absolute left-4 right-4 h-0.5 bg-slate-800" />
          <div className="absolute left-4 h-0.5 bg-gradient-to-r from-cyan-500 to-cyan-700" style={{ width: '4%' }} />
          {milestones.map((_, i) => (
            <div
              key={i}
              className="relative flex-1 flex justify-center"
              style={{ zIndex: 1 }}
            >
              <div
                className={`w-3 h-3 rounded-full border-2 ${
                  _.status === 'active'
                    ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                    : 'bg-[#090d16] border-slate-700'
                }`}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-2.5">
          {milestones.map((m, idx) => (
            <div
              key={idx}
              onMouseEnter={() => setHoveredMilestone(idx)}
              onMouseLeave={() => setHoveredMilestone(null)}
              className={`p-3 rounded-lg border flex flex-col justify-between cursor-default transition-all duration-200 ${
                m.status === 'active'
                  ? statusColors[m.color]
                  : hoveredMilestone === idx
                  ? `border-slate-600 bg-slate-900/40 ${textColors[m.color]}`
                  : 'bg-[#030712] border-slate-800/60 text-slate-400'
              }`}
            >
              <div>
                {/* Дата + дельта */}
                <div className="flex justify-between items-center text-[9px] mb-1.5">
                  <span className={m.status === 'active' ? textColors[m.color] : 'text-slate-500'}>
                    {m.targetDate}
                  </span>
                  <span className={`px-1 py-0.5 rounded text-[9px] border ${badgeColors[m.color]}`}>
                    {m.deltaKg}
                  </span>
                </div>

                {/* Название этапа */}
                <div className={`text-xs font-bold mt-1 ${m.status === 'active' ? textColors[m.color] : 'text-slate-300'}`}>
                  {m.phase}
                </div>

                {/* Целевой вес + % жира */}
                <div className="mt-1.5">
                  <span className={`text-sm font-bold ${m.status === 'active' ? textColors[m.color] : 'text-slate-200'}`}>
                    {m.targetWeight} кг
                  </span>
                  <span className="text-[10px] text-amber-400 ml-1.5">{m.targetFatPct}% жира</span>
                </div>
              </div>

              {/* Фокус этапа */}
              <div className="text-[9px] text-slate-500 mt-2 pt-2 border-t border-slate-800/60 leading-tight">
                {m.focus}
              </div>

              {/* Статус-индикатор */}
              <div className="mt-2 flex items-center gap-1">
                {m.status === 'active' ? (
                  <span className="flex items-center gap-1 text-[9px] text-cyan-400 font-bold">
                    <Zap className="w-2.5 h-2.5" /> ТЕКУЩИЙ ЭТАП
                  </span>
                ) : m.status === 'completed' ? (
                  <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                    <CheckCircle2 className="w-2.5 h-2.5" /> ВЫПОЛНЕН
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-600 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> В ОЖИДАНИИ
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Diet Break / Deload напоминание */}
        <div className="mt-3 p-3 border border-dashed border-slate-700 rounded-lg bg-[#030712] flex items-start gap-3 text-[10px]">
          <Award className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-indigo-300 font-bold">DIET BREAK & DELOAD:</span>{' '}
            <span className="text-slate-400">
              11–20 декабря 2026 (10 дней) — выход на TDEE ≈ 2500–2600 ккал, объем тренировок −40%.
              Цель: восстановление лептина, щитовидной железы и суставно-связочного аппарата.
              Вес удерживается на ≈ 93.5–94.0 кг.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
