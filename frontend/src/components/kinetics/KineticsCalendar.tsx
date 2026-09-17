import React, { useState, useEffect } from 'react';
import { ShieldAlert, Zap, CalendarDays, ArrowRightRight, History, CheckCircle2, XCircle, Clock, Moon } from 'lucide-react';
import { kineticsApi } from '../../api/kinetics';

export type SessionIntensity = 'heavy' | 'hypertrophy' | 'active_rest' | 'recovery';
export type SessionStatus = 'completed' | 'planned' | 'missed';

export interface CalendarDay {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 1-7 (Пн-Вс)
  title: string;
  intensity: SessionIntensity;
  status: SessionStatus;
  estimatedRpe: number;
  completedRpe?: number;
  planId?: string;
}

const intensityColors: Record<SessionIntensity, string> = {
  heavy: 'border-rose-500/40 bg-rose-950/20 text-rose-400',
  hypertrophy: 'border-amber-500/40 bg-amber-950/20 text-amber-400',
  active_rest: 'border-cyan-500/40 bg-cyan-950/20 text-cyan-400',
  recovery: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400',
};

const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const initialDays: CalendarDay[] = [
  // Неделя 1 (Прошлая)
  { id: '1', date: '12 Окт', dayOfWeek: 1, title: 'Push (Сила)', intensity: 'heavy', status: 'completed', estimatedRpe: 8, completedRpe: 8 },
  { id: '2', date: '13 Окт', dayOfWeek: 2, title: 'Восстановление', intensity: 'recovery', status: 'completed', estimatedRpe: 1 },
  { id: '3', date: '14 Окт', dayOfWeek: 3, title: 'Pull (Сила)', intensity: 'heavy', status: 'completed', estimatedRpe: 8, completedRpe: 9 },
  { id: '4', date: '15 Окт', dayOfWeek: 4, title: 'Активный отдых', intensity: 'active_rest', status: 'completed', estimatedRpe: 4, completedRpe: 4 },
  { id: '5', date: '16 Окт', dayOfWeek: 5, title: 'Legs (Сила)', intensity: 'heavy', status: 'missed', estimatedRpe: 8 },
  { id: '6', date: '17 Окт', dayOfWeek: 6, title: 'Восстановление', intensity: 'recovery', status: 'completed', estimatedRpe: 1 },
  { id: '7', date: '18 Окт', dayOfWeek: 7, title: 'Fullbody (Объем)', intensity: 'hypertrophy', status: 'missed', estimatedRpe: 7 },

  // Неделя 2 (Текущая)
  { id: '8', date: '19 Окт', dayOfWeek: 1, title: 'Push (Сила)', intensity: 'heavy', status: 'planned', estimatedRpe: 8 },
  { id: '9', date: '20 Окт', dayOfWeek: 2, title: 'Восстановление', intensity: 'recovery', status: 'planned', estimatedRpe: 1 },
  { id: '10', date: '21 Окт', dayOfWeek: 3, title: 'Pull (Сила)', intensity: 'heavy', status: 'planned', estimatedRpe: 8 },
  { id: '11', date: '22 Окт', dayOfWeek: 4, title: 'Активный отдых', intensity: 'active_rest', status: 'planned', estimatedRpe: 4 },
  { id: '12', date: '23 Окт', dayOfWeek: 5, title: 'Legs (Сила)', intensity: 'heavy', status: 'planned', estimatedRpe: 8 },
  { id: '13', date: '24 Окт', dayOfWeek: 6, title: 'Восстановление', intensity: 'recovery', status: 'planned', estimatedRpe: 1 },
  { id: '14', date: '25 Окт', dayOfWeek: 7, title: 'Fullbody', intensity: 'hypertrophy', status: 'planned', estimatedRpe: 7 },
  
  // Неделя 3 (Будущая)
  { id: '15', date: '26 Окт', dayOfWeek: 1, title: 'Push (Сила)', intensity: 'heavy', status: 'planned', estimatedRpe: 8 },
  { id: '16', date: '27 Окт', dayOfWeek: 2, title: 'Восстановление', intensity: 'recovery', status: 'planned', estimatedRpe: 1 },
  { id: '17', date: '28 Окт', dayOfWeek: 3, title: 'Pull (Сила)', intensity: 'heavy', status: 'planned', estimatedRpe: 8 },
  { id: '18', date: '29 Окт', dayOfWeek: 4, title: 'Активный отдых', intensity: 'active_rest', status: 'planned', estimatedRpe: 4 },
  { id: '19', date: '30 Окт', dayOfWeek: 5, title: 'Legs (Сила)', intensity: 'heavy', status: 'planned', estimatedRpe: 8 },
  { id: '20', date: '31 Окт', dayOfWeek: 6, title: 'Восстановление', intensity: 'recovery', status: 'planned', estimatedRpe: 1 },
  { id: '21', date: '01 Ноя', dayOfWeek: 7, title: 'Fullbody', intensity: 'hypertrophy', status: 'planned', estimatedRpe: 7 },
];

export const KineticsCalendar: React.FC = () => {
  const [days, setDays] = useState<CalendarDay[]>(initialDays);
  const [fatigueScore, setFatigueScore] = useState<number>(8.5); // Высокое системное утомление
  const [sleepHours, setSleepHours] = useState<number>(5.5); // Недосып
  const [logs, setLogs] = useState<string[]>([]);
  const [isRescheduling, setIsRescheduling] = useState(false);

  useEffect(() => {
    kineticsApi.getCalendarMonth().then(data => {
      if (data && data.length > 0) {
        setDays(data as CalendarDay[]);
      }
    }).catch(err => console.error("Error loading calendar month", err));
  }, []);

  const handleReschedule = async () => {
    if (isRescheduling) return;
    setIsRescheduling(true);
    let newDays = [...days];
    let newLogs: string[] = [];
    
    // Находим все missed сессии
    const missedIndices = newDays
      .map((d, i) => (d.status === 'missed' ? i : -1))
      .filter((i) => i !== -1);

    if (missedIndices.length === 0) {
      newLogs.push('Пропущенных сессий нет. Сетка оптимальна.');
      setLogs(prev => [...newLogs, ...prev].slice(0, 5));
      return;
    }

    missedIndices.forEach(index => {
      const missedDay = newDays[index];
      
      // Ищем ближайший будущий planned день восстановления
      const futureRecoveryIndex = newDays.findIndex(
        (d, i) => i > index && d.status === 'planned' && (d.intensity === 'recovery' || d.intensity === 'active_rest')
      );

      if (futureRecoveryIndex !== -1) {
        const targetDay = newDays[futureRecoveryIndex];
        
        // Эвристика: если утомление высокое, снижаем интенсивность тяжелой сессии при переносе
        let newIntensity = missedDay.intensity;
        let newRpe = missedDay.estimatedRpe;
        let newTitle = missedDay.title;

        if (missedDay.intensity === 'heavy' && (fatigueScore >= 8 || sleepHours < 6)) {
          newIntensity = 'hypertrophy';
          newRpe = Math.max(6, newRpe - 2);
          newTitle = missedDay.title.replace('(Сила)', '(Объем, Сниж. RPE)');
          newLogs.push(`КРИТИЧЕСКОЕ УТОМЛЕНИЕ: Тяжелая сессия "${missedDay.title}" понижена до Hypertrophy (RPE ${newRpe}) и перенесена на ${targetDay.date}.`);
        } else {
          newLogs.push(`ПЕРЕНОС: Сессия "${missedDay.title}" перенесена на свободный день ${targetDay.date}.`);
        }

        // Обновляем targetDay
        newDays[futureRecoveryIndex] = {
          ...targetDay,
          title: newTitle,
          intensity: newIntensity,
          estimatedRpe: newRpe,
        };

        // Помечаем старый день как recovery
        newDays[index] = {
          ...missedDay,
          title: 'Смещено',
          intensity: 'recovery',
          status: 'completed',
          estimatedRpe: 1
        };
      } else {
        newLogs.push(`ОТМЕНА: Не найдено окон для переноса "${missedDay.title}". Сессия отменена (Deload).`);
        newDays[index] = {
          ...missedDay,
          title: 'Отменено',
          intensity: 'recovery',
          status: 'completed'
        };
      }
    });

    try {
      await kineticsApi.rescheduleCalendar(newDays);
      newLogs.push('СИНХРОНИЗАЦИЯ: Изменения сохранены в базе данных (WorkoutPlan).');
    } catch (e) {
      newLogs.push('ОШИБКА СИНХРОНИЗАЦИИ: Не удалось сохранить изменения на сервере.');
    }

    setDays(newDays);
    setLogs(prev => [...newLogs, ...prev].slice(0, 10));
    setFatigueScore(6.0); // Эмулируем, что после перепланировки утомление "разгрузится"
    setIsRescheduling(false);
  };

  return (
    <div className="flex h-full gap-4 font-mono w-full">
      
      {/* ЛЕВАЯ КОЛОНКА: Сайдбар (Утомление и логи) */}
      <div className="w-1/4 min-w-[280px] max-w-sm flex flex-col gap-4">
        
        <div className="bg-[#090d16] border border-slate-800 rounded-xl p-5 shrink-0 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
          <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2 tracking-widest">
            <ShieldAlert className="w-4 h-4 text-indigo-400" />
            СИСТЕМНЫЙ СТРЕСС
          </h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Накопленное утомление ЦНС</span>
                <span className={fatigueScore >= 8 ? 'text-rose-400 font-bold' : 'text-indigo-400'}>{fatigueScore.toFixed(1)} / 10</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div style={{ width: `${(fatigueScore / 10) * 100}%` }} className={`h-full ${fatigueScore >= 8 ? 'bg-rose-500' : 'bg-indigo-500'}`} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Средний сон (3 дня)</span>
                <span className={sleepHours < 6 ? 'text-amber-400 font-bold' : 'text-cyan-400'}>{sleepHours.toFixed(1)} ч</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div style={{ width: `${(sleepHours / 10) * 100}%` }} className={`h-full ${sleepHours < 6 ? 'bg-amber-500' : 'bg-cyan-500'}`} />
              </div>
            </div>
          </div>

          <button
            onClick={handleReschedule}
            className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]"
          >
            <ArrowRightRight className="w-4 h-4" />
            АВТО-ПЕРЕНОС СЕССИЙ
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-[#090d16] border border-slate-800 rounded-xl p-5 flex flex-col shadow-[0_0_20px_rgba(0,0,0,0.5)]">
          <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2 tracking-widest shrink-0">
            <History className="w-4 h-4 text-slate-400" />
            ЖУРНАЛ СИНТЕЗА
          </h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
            {logs.length === 0 ? (
              <div className="text-xs text-slate-500 italic text-center mt-4">Ожидание команд перерасчета...</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className={`text-[10px] leading-relaxed border-l-2 pl-2 py-1 ${log.includes('КРИТИЧЕСКОЕ') ? 'border-rose-500 text-rose-300/90' : 'border-indigo-500 text-slate-400'}`}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ПРАВАЯ КОЛОНКА: Сетка календаря */}
      <div className="flex-1 bg-[#030712] border border-slate-800/60 rounded-xl p-5 flex flex-col h-full overflow-y-auto custom-scrollbar shadow-inner">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-cyan-400" />
            МИКРОЦИКЛЫ: ОКТЯБРЬ — НОЯБРЬ 2026
          </h2>
          <div className="flex gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500/80" />Сила (Heavy)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/80" />Объем (Hypertrophy)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/80" />Активный (Active Rest)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />Отдых (Recovery)</span>
          </div>
        </div>

        {/* Заголовки дней недели */}
        <div className="grid grid-cols-7 gap-3 mb-3 shrink-0">
          {weekDays.map(day => (
            <div key={day} className="text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
              {day}
            </div>
          ))}
        </div>

        {/* Сетка дней */}
        <div className="grid grid-cols-7 gap-3 auto-rows-max">
          {days.map((day) => (
            <div 
              key={day.id} 
              className={`flex flex-col border rounded-lg p-2.5 min-h-[90px] transition-all duration-300 ${intensityColors[day.intensity]} ${day.status === 'missed' ? 'opacity-70 border-dashed ring-2 ring-rose-500/30 ring-offset-2 ring-offset-[#030712]' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold opacity-70">{day.date}</span>
                {day.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {day.status === 'missed' && <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                {day.status === 'planned' && <Clock className="w-3 h-3 opacity-50" />}
              </div>
              
              <div className={`text-xs font-bold leading-tight ${day.status === 'missed' ? 'line-through decoration-rose-500/60 decoration-2' : ''}`}>
                {day.title}
              </div>

              <div className="mt-auto pt-2 flex justify-between items-center">
                {day.intensity !== 'recovery' && day.intensity !== 'active_rest' ? (
                  <span className="text-[9px] font-bold bg-black/30 px-1.5 py-0.5 rounded">RPE {day.estimatedRpe}</span>
                ) : (
                  <Moon className="w-3 h-3 opacity-50" />
                )}
                {day.status === 'completed' && day.completedRpe && (
                  <span className="text-[9px] text-emerald-300 ml-auto">Факт: {day.completedRpe}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
