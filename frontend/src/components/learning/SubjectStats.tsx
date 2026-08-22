import React, { useState, useEffect, useMemo } from 'react';
import { subjectsApi, SubjectStatsData } from '../../api/subjects';
import { 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  Flame, 
  AlertTriangle, 
  GraduationCap, 
  Layers, 
  BookOpen, 
  RefreshCw,
  CalendarDays,
  Download
} from 'lucide-react';
import clsx from 'clsx';

interface SubjectStatsProps {
  subjectId: string;
}

export const SubjectStats: React.FC<SubjectStatsProps> = ({ subjectId }) => {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | 'season_3m' | 'all'>('season_3m');
  const [stats, setStats] = useState<SubjectStatsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number } | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await subjectsApi.getStats(subjectId, timeframe);
      setStats(data);
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [subjectId, timeframe]);

  const handleDownloadReport = async () => {
    try {
      const { markdown } = await subjectsApi.getWeakSpotsReport(subjectId);
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CheatSheet_${subjectId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download report:', e);
    }
  };

  // Генерация сетки GitHub Heatmap за последние 16 недель (~112 дней)
  const heatmapWeeks = useMemo(() => {
    const weeks: Array<Array<{ date: string; count: number; dayOfWeek: number }>> = [];
    const today = new Date();
    
    // Сдвигаем к концу текущей недели (воскресенье)
    const endDate = new Date(today);
    const dayOfWeek = (today.getDay() + 6) % 7; // 0 = Пн, 6 = Вс
    endDate.setDate(today.getDate() + (6 - dayOfWeek));

    // 16 недель назад
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (16 * 7 - 1));

    const currentDate = new Date(startDate);
    let currentWeek: Array<{ date: string; count: number; dayOfWeek: number }> = [];

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const count = stats?.activity_map?.[dateStr] || 0;
      const dow = (currentDate.getDay() + 6) % 7;

      currentWeek.push({
        date: dateStr,
        count,
        dayOfWeek: dow,
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [stats?.activity_map]);

  const getActivityColor = (count: number) => {
    if (count === 0) return 'bg-zinc-900 border-zinc-800/80';
    if (count === 1) return 'bg-indigo-950 border-indigo-700/50 text-indigo-200';
    if (count <= 3) return 'bg-indigo-700 border-indigo-500';
    if (count <= 6) return 'bg-indigo-500 border-indigo-400';
    return 'bg-indigo-400 border-white shadow-sm shadow-indigo-500/50';
  };

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-zinc-400">
        <RefreshCw className="animate-spin text-indigo-500 mb-3" size={28} />
        <p className="text-xs text-zinc-400">Загрузка аналитики...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок и селектор периода */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Аналитика и активность</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Динамика освоения и интенсивность практики
            {stats?.since_date && ` (с ${new Date(stats.since_date).toLocaleDateString('ru-RU')})`}
          </p>
        </div>

        {/* Фильтр по периоду */}
        <div className="flex items-center gap-1 bg-[#111115] border border-zinc-800/90 p-1 rounded-xl self-start sm:self-auto">
          {[
            { id: '7d', label: '7 дней' },
            { id: '30d', label: '30 дней' },
            { id: 'season_3m', label: 'Сезон (3 мес.)' },
            { id: 'all', label: 'Всё время' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTimeframe(item.id as any)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                timeframe === item.id
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Верхние метрики */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Освоение</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{stats?.mastery_score || 0}%</div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {stats?.is_mastered ? '🏆 Предмет освоен' : 'По дорожной карте'}
          </p>
        </div>

        <div className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Текущий стрик</span>
            <Flame size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">{stats?.current_streak || 0} дн.</div>
          <p className="text-[11px] text-zinc-500 mt-1">Подряд без пропусков</p>
        </div>

        <div className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Средний балл</span>
            <BarChart3 size={16} className="text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white">{stats?.avg_score || 0}%</div>
          <p className="text-[11px] text-zinc-500 mt-1">Всего сессий: {stats?.total_sessions || 0}</p>
        </div>

        <div className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Экзамены</span>
            <GraduationCap size={16} className="text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white">{stats?.exam_count || 0}</div>
          <p className="text-[11px] text-zinc-500 mt-1">Итоговые сдачи</p>
        </div>
      </div>

      {/* GitHub Style Activity Heatmap */}
      <div className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Календарь активности</h3>
          </div>
          <div className="text-xs text-zinc-400 font-medium">
            {hoveredDay ? (
              <span className="text-indigo-300">
                {new Date(hoveredDay.date).toLocaleDateString('ru-RU')}:{' '}
                <strong className="text-white">{hoveredDay.count}</strong>{' '}
                {hoveredDay.count === 1 ? 'сессия' : hoveredDay.count >= 2 && hoveredDay.count <= 4 ? 'сессии' : 'сессий'}
              </span>
            ) : (
              'Наведите на ячейку для деталей'
            )}
          </div>
        </div>

        {/* Сетка активности */}
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex gap-1.5">
            {/* Метки дней недели */}
            <div className="flex flex-col gap-1.5 pr-2 text-[10px] text-zinc-500 font-mono select-none">
              <span className="h-3.5 leading-3.5">Пн</span>
              <span className="h-3.5 leading-3.5 opacity-0">Вт</span>
              <span className="h-3.5 leading-3.5">Ср</span>
              <span className="h-3.5 leading-3.5 opacity-0">Чт</span>
              <span className="h-3.5 leading-3.5">Пт</span>
              <span className="h-3.5 leading-3.5 opacity-0">Сб</span>
              <span className="h-3.5 leading-3.5">Вс</span>
            </div>

            {/* Колонки недель */}
            {heatmapWeeks.map((week, wIdx) => (
              <div key={`week-${wIdx}`} className="flex flex-col gap-1.5">
                {week.map((day) => (
                  <div
                    key={day.date}
                    onMouseEnter={() => setHoveredDay({ date: day.date, count: day.count })}
                    onMouseLeave={() => setHoveredDay(null)}
                    className={clsx(
                      'w-3.5 h-3.5 rounded-[3px] border transition-all cursor-pointer hover:scale-125 hover:z-10',
                      getActivityColor(day.count)
                    )}
                    title={`${day.date}: ${day.count} сессий`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Легенда */}
        <div className="flex items-center justify-end gap-2 mt-4 text-[11px] text-zinc-500">
          <span>Меньше</span>
          <div className="w-3 h-3 rounded-[2px] bg-zinc-900 border border-zinc-800/80" />
          <div className="w-3 h-3 rounded-[2px] bg-indigo-950 border border-indigo-700/50" />
          <div className="w-3 h-3 rounded-[2px] bg-indigo-700 border border-indigo-500" />
          <div className="w-3 h-3 rounded-[2px] bg-indigo-500 border border-indigo-400" />
          <div className="w-3 h-3 rounded-[2px] bg-indigo-400 border border-white" />
          <span>Больше</span>
        </div>
      </div>

      {/* Разбор: Слабые места и История сессий */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Слабые места */}
        <div className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">Требует повторения</h3>
            </div>
            
            {stats?.weak_spots && stats.weak_spots.length > 0 && (
              <button
                onClick={handleDownloadReport}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors border border-indigo-500/20 shrink-0 whitespace-nowrap"
                title="Скачать шпаргалку перед экзаменом"
              >
                <Download size={14} />
                <span className="text-[11px] font-medium hidden sm:inline">Шпаргалка</span>
              </button>
            )}
          </div>

          {stats?.weak_spots && stats.weak_spots.length > 0 ? (
            <div className="space-y-2.5">
              {stats.weak_spots.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-3"
                >
                  <span className="text-xs font-medium text-zinc-300 leading-relaxed">
                    {item.concept}
                  </span>
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                    {item.count} {item.count === 1 ? 'ошибка' : 'ошибки'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-xs">
              Нет зафиксированных ошибок за этот период.
            </div>
          )}
        </div>

        {/* Последние сессии */}
        <div className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-indigo-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">История последних сессий</h3>
          </div>

          {stats?.recent_sessions && stats.recent_sessions.length > 0 ? (
            <div className="space-y-2">
              {stats.recent_sessions.map((s) => (
                <div
                  key={s.id}
                  className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 shrink-0">
                      {s.session_type === 'quiz' && <BookOpen size={13} />}
                      {s.session_type === 'flashcard' && <Layers size={13} />}
                      {s.session_type === 'exam' && <GraduationCap size={13} className="text-amber-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-200 truncate">{s.topic_name}</div>
                      <div className="text-[10px] text-zinc-500">{s.created_at}</div>
                    </div>
                  </div>
                  <div className={clsx(
                    "text-xs font-bold shrink-0 px-2 py-0.5 rounded-md border",
                    s.score >= 80 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : s.score >= 50
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  )}>
                    {Math.round(s.score)}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-xs">
              За выбранный период сессий еще не проводилось.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
