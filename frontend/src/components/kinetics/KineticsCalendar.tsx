import React, { useState, useEffect } from 'react';
import { AlertTriangle, Moon, Activity, Dumbbell, Zap, Copy, X, Loader2, ChevronDown, ChevronUp, Trash2, RefreshCw, Plus, MapPin } from 'lucide-react';
import { ExerciseSetTable } from './ExerciseSetTable';
import { kineticsApi } from '../../api/kinetics';
import { WorkoutPlan, WorkoutExercise } from '../../api/kinetics';
import { MesocycleGeneratorModal } from './MesocycleGeneratorModal';


const toLocalDateKey = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const SPLIT_COLORS: Record<string, { label: string; color: string }> = {
  push: { label: 'Push', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  pull: { label: 'Pull', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  legs: { label: 'Legs', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  fullbody: { label: 'Fullbody', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  core: { label: 'Кор', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  shoulders: { label: 'Плечи', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  neck: { label: 'Шея', color: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  functional: { label: 'Функционал', color: 'bg-teal-500/10 text-teal-400 border-teal-500/30' },
  default: { label: 'Сессия', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
};

function resolveSplitType(targetSplit?: string): { label: string; color: string } {
  const s = (targetSplit || '').toLowerCase();
  if (s.includes('push') || s.includes('грудь')) return SPLIT_COLORS.push;
  if (s.includes('pull') || s.includes('спина')) return SPLIT_COLORS.pull;
  if (s.includes('ноги') || s.includes('legs')) return SPLIT_COLORS.legs;
  if (s.includes('фулбоди') || s.includes('fullbody')) return SPLIT_COLORS.fullbody;
  if (s.includes('кор')) return SPLIT_COLORS.core;
  if (s.includes('плечи') || s.includes('дельты')) return SPLIT_COLORS.shoulders;
  if (s.includes('шея')) return SPLIT_COLORS.neck;
  if (s.includes('функционал') || s.includes('кардио')) return SPLIT_COLORS.functional;
  return { label: targetSplit || 'Тренировка', color: SPLIT_COLORS.default.color };
}


interface CalendarProps {
  plans: WorkoutPlan[];
  onSelectPlan: (plan: WorkoutPlan | null, date: Date) => void;
}

export const MonthGrid: React.FC<CalendarProps & { selectedDateStr?: string }> = ({ plans, onSelectPlan, selectedDateStr: propsSelectedDateStr }) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [localSelectedDateStr, setSelectedDateStr] = useState<string>(toLocalDateKey(new Date()));
  const selectedDateStr = propsSelectedDateStr || localSelectedDateStr;

  const plansByDate = React.useMemo(() => {
    const map = new Map<string, WorkoutPlan>();
    plans.forEach(p => {
      const d = p.scheduled_date || (p.created_at ? toLocalDateKey(new Date(p.created_at)) : undefined);
      if (d) map.set(d, p);
    });
    return map;
  }, [plans]);

  const daysInGrid = React.useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      const prevDate = new Date(year, month, -i);
      days.push({ date: prevDate, isCurrentMonth: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    while (days.length % 7 !== 0) {
      const nextDate = new Date(year, month + 1, days.length - totalDays - startOffset + 1);
      days.push({ date: nextDate, isCurrentMonth: false });
    }
    return days;
  }, [currentMonth]);

  const handleDayClick = (date: Date) => {
    const dateStr = toLocalDateKey(date);
    setSelectedDateStr(dateStr);
    const plan = plansByDate.get(dateStr) || null;
    onSelectPlan(plan, date);
  };

  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
      <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-mono text-slate-500">
        {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {daysInGrid.map(({ date, isCurrentMonth }, idx) => {
          const dateStr = toLocalDateKey(date);
          const plan = plansByDate.get(dateStr);
          const isSelected = selectedDateStr === dateStr;
          const isToday = toLocalDateKey(new Date()) === dateStr;

          return (
            <div
              key={idx}
              onClick={() => handleDayClick(date)}
              className={`min-h-[78px] p-1.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-cyan-500 bg-cyan-950/20 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                  : isCurrentMonth
                  ? 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
                  : 'border-transparent bg-slate-950/20 opacity-30'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className={`text-xs font-mono ${isToday ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}>
                  {date.getDate()}
                </span>
                {plan?.status === 'completed' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" />
                )}
              </div>
              {plan ? (
                <div className="mt-1 px-1.5 py-1 rounded bg-purple-950/40 border border-purple-800/50 text-[10px]">
                  <div className="font-semibold text-purple-300 truncate">{plan.target_split || plan.split_type || 'Сессия'}</div>
                  <div className="text-slate-400 text-[9px]">{plan.exercises?.length || 0} упр.</div>
                </div>
              ) : (
                <div className="text-[9px] text-slate-600 font-mono text-center pb-1">Отдых</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const KineticsCalendar: React.FC<{ selectedDate?: Date, onDateSelect?: (date: Date) => void, onStartTimer?: (seconds: number) => void }> = ({ selectedDate: propsSelectedDate, onDateSelect, onStartTimer }) => {

  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<WorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [localSelectedDate, setLocalSelectedDate] = useState<Date>(new Date());
  const selectedDate = propsSelectedDate || localSelectedDate;
  const setSelectedDate = onDateSelect || setLocalSelectedDate;
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const [expandedExerciseId, setExpandedExerciseId] = useState<string | number | null>(null);
  const toggleExercise = (id: string | number) => {
    setExpandedExerciseId(prev => (prev === id ? null : id));
  };


    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
    const [duplicateTargetDate, setDuplicateTargetDate] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return toLocalDateKey(d);
    });
    const [applyOverload, setApplyOverload] = useState(false);
    const [overloadIncrement, setOverloadIncrement] = useState(1.25);
    const [isDuplicating, setIsDuplicating] = useState(false);

    // --- Add Exercise Modal ---
    const [isAddExModalOpen, setIsAddExModalOpen] = useState(false);
    const [newExName, setNewExName] = useState('');
    const [newExSets, setNewExSets] = useState(3);
    const [newExReps, setNewExReps] = useState('10-12');
    const [newExRpe, setNewExRpe] = useState(7);
    const [isAddingEx, setIsAddingEx] = useState(false);

    // --- Swap Exercise Modal ---
    const [swapExId, setSwapExId] = useState<string | null>(null);
    const [swapReason, setSwapReason] = useState('joint_pain');
    const [swapNewName, setSwapNewName] = useState('');
    const [isSwapping, setIsSwapping] = useState(false);

    const handleDeleteExercise = async (exId: string) => {
      if (!selectedPlan) return;
      try {
        await kineticsApi.deleteExercise(exId);
        setSelectedPlan(prev => prev ? {
          ...prev,
          exercises: prev.exercises.filter(e => String(e.id) !== String(exId))
        } : null);
        setPlans(prev => prev.map(p => p.id === selectedPlan.id ? {
          ...p,
          exercises: (p.exercises || []).filter(e => String(e.id) !== String(exId))
        } : p));
      } catch (e) { console.error(e); }
    };

    const handleAddExercise = async () => {
      if (!selectedPlan || !newExName.trim()) return;
      setIsAddingEx(true);
      try {
        const added = await kineticsApi.addExercise(selectedPlan.id, {
          exercise_name: newExName.trim(),
          sets: newExSets,
          reps_or_duration: newExReps,
          rpe_target: newExRpe,
          target_muscle_groups: []
        });
        setSelectedPlan(prev => prev ? { ...prev, exercises: [...prev.exercises, added] } : null);
        setIsAddExModalOpen(false);
        setNewExName('');
      } catch (e) { console.error(e); }
      finally { setIsAddingEx(false); }
    };

    const handleSwapExercise = async () => {
      if (!swapExId || !swapNewName.trim()) return;
      setIsSwapping(true);
      try {
        const updated = await kineticsApi.swapExercise(swapExId, swapNewName.trim(), swapReason);
        setSelectedPlan(prev => prev ? {
          ...prev,
          exercises: prev.exercises.map(e => String(e.id) === swapExId ? updated : e)
        } : null);
        setSwapExId(null);
        setSwapNewName('');
      } catch (e) { console.error(e); }
      finally { setIsSwapping(false); }
    };

    const handleDuplicate = async () => {
      if (!selectedPlan) return;
      setIsDuplicating(true);
      try {
        await kineticsApi.duplicateWorkoutPlan(selectedPlan.id, duplicateTargetDate, applyOverload, overloadIncrement);
        setIsDuplicateModalOpen(false);
        // Refresh plans
        window.location.reload();
      } catch (e) {
        console.error(e);
      } finally {
        setIsDuplicating(false);
      }
    };


  const fetchCalendar = () => {
    setIsLoading(true);
    kineticsApi.getCalendarMonth()
      .then((data) => {
        const uniqueDates = new Set();
        const filteredPlans: WorkoutPlan[] = [];
        for (let i = data.length - 1; i >= 0; i--) {
          const dateKey = new Date(data[i].created_at).toLocaleDateString('ru-RU');
          if (!uniqueDates.has(dateKey)) {
            uniqueDates.add(dateKey);
            filteredPlans.unshift(data[i]);
          }
        }
        
        setPlans(filteredPlans);
      })
      .catch((err) => console.error('Ошибка загрузки календаря:', err))
      .finally(() => setIsLoading(false));
  };

  const handleComplete = async () => {
    if (!selectedPlan) return;
    try {
      const updated = await kineticsApi.completeWorkout(selectedPlan.id);
      setSelectedPlan(updated);
      setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, []);

  useEffect(() => {
    if (plans.length > 0) {
      const targetDateKey = toLocalDateKey(selectedDate);
      const planForDate = plans.find(p => {
        const d = p.scheduled_date || (p.created_at ? toLocalDateKey(new Date(p.created_at)) : undefined);
        return d === targetDateKey;
      });
      setSelectedPlan(planForDate || null);
    }
  }, [selectedDate, plans]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 p-2 font-mono">
      <MesocycleGeneratorModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchCalendar()}
      />
      {/* Левая панель: Сетка тренировочных сессий */}
      <div className="xl:col-span-3 bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-wider text-slate-400">АРХИВ И ПЛАН СЕССИЙ:</span>
              <h3 className="text-sm font-bold text-slate-200">АКТИВНЫЙ МЕЗОЦИКЛ</h3>
            </div>
            
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/40 rounded transition-colors mr-2"
              >
                <Zap className="w-3 h-3" />
                <span className="font-bold uppercase tracking-wider">Синтез мезоцикла (4 недели)</span>
              </button>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500"></span> Push</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-500"></span> Pull</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500"></span> Legs</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500"></span> Fullbody</span>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-slate-500 text-xs">Загрузка данных телеметрии...</div>
          ) : (
            <MonthGrid plans={plans} selectedDateStr={toLocalDateKey(selectedDate)} onSelectPlan={(plan, date) => {
              setSelectedPlan(plan);
              setSelectedDate(date);
            }} />
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
          <span>Синхронизировано с pgvector и телеметрией атлета</span>
          <span>Всего сессий в базе: {plans.length}</span>
        </div>
      </div>

      {/* Правая панель: Системный стресс и Инспектор упражнений */}
      <div className="space-y-4">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-400 mb-3">
            <AlertTriangle className="w-4 h-4" />
            <span>СИСТЕМНЫЙ СТРЕСС</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Утомление ЦНС</span>
                <span className="text-rose-400 font-bold">8.5 / 10</span>
              </div>
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full w-[85%]"></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Средний сон (3 дня)</span>
                <span className="text-amber-400 font-bold">5.5 ч</span>
              </div>
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-400 h-full rounded-full w-[65%]"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Инспектор упражнений выбранного дня */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-cyan-400" />
              ДЕТАЛИ СЕССИИ
            </span>
            <div className="flex items-center gap-3">
              {selectedPlan && (
                <button
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setDuplicateTargetDate(toLocalDateKey(tomorrow));
                    setIsDuplicateModalOpen(true);
                  }}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 rounded transition-colors"
                  title="Дуплирај тренинг"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
              {selectedPlan?.status === 'completed' && (
                <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded">ВЫПОЛНЕНО</span>
              )}
              <span className="text-[10px] text-slate-500">
                {selectedDate ? selectedDate.toLocaleDateString('ru-RU') : (selectedPlan ? new Date(selectedPlan.created_at).toLocaleDateString('ru-RU') : '')}
              </span>
            </div>
          </div>

          {selectedPlan ? (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-bold text-cyan-300">
                  {selectedPlan.target_split || (selectedPlan as any).split_day || 'Тренировка'}
                </div>
                <button
                  onClick={async () => {
                    const next = selectedPlan.location === 'Зал' ? 'Дом' : 'Зал';
                    try {
                      await kineticsApi.updateWorkoutPlanSettings({ plan_id: selectedPlan.id, location: next } as any);
                      setSelectedPlan(prev => prev ? { ...prev, location: next } : null);
                    } catch { /**/ }
                  }}
                  className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 hover:text-cyan-300 transition-colors group"
                >
                  <MapPin className="w-3 h-3" />
                  Локация: <span className="text-slate-200 group-hover:text-cyan-300">{selectedPlan.location || 'Дом'}</span>
                  <span className="text-slate-600 text-[9px] ml-1">(клик — сменить)</span>
                </button>
              </div>

              {selectedPlan.ai_rationale && (
                <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80 leading-relaxed italic">
                  "{selectedPlan.ai_rationale}"
                </div>
              )}

              <div className="pt-2 border-t border-slate-800/60 mt-3">
                <div className="text-[11px] font-bold text-slate-400 mb-2">УПРАЖНЕНИЯ:</div>
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {selectedPlan.exercises && selectedPlan.exercises.length > 0 ? (
                    selectedPlan.exercises.map((ex: WorkoutExercise, idx: number) => {
                      const exerciseId = ex.id || idx;
                      const isExpanded = expandedExerciseId === exerciseId;

                      return (
                        <div 
                          key={exerciseId}
                          className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden transition-colors"
                        >
                          <div
                            onClick={() => toggleExercise(exerciseId)}
                            className="p-2.5 text-xs flex justify-between items-center cursor-pointer hover:bg-slate-800/40 select-none"
                          >
                            <div className="pr-2 flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              <div>
                                <div className="font-semibold text-slate-200 text-[11px]">
                                  {ex.exercise_name}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {Array.isArray(ex.target_muscle_groups)
                                    ? ex.target_muscle_groups.join(', ')
                                    : (ex.target_muscle_groups || 'Функционал')}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <div className="text-right whitespace-nowrap mr-2">
                                <div className="text-cyan-400 font-bold text-[11px]">
                                  {ex.sets} × {ex.reps_or_duration}
                                </div>
                                <div className="text-[10px] text-slate-400">RPE {ex.rpe_target}</div>
                              </div>
                              {/* Swap button */}
                              <button
                                onClick={e => { e.stopPropagation(); setSwapExId(String(ex.id)); setSwapNewName(''); }}
                                title="Заменить упражнение"
                                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-amber-400 transition-colors"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                              {/* Delete button */}
                              <button
                                onClick={e => { e.stopPropagation(); if (confirm(`Удалить «${ex.exercise_name}»?`)) handleDeleteExercise(String(ex.id)); }}
                                title="Удалить упражнение"
                                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-3 pt-1 border-t border-slate-800/80 bg-slate-950/60">
                              <ExerciseSetTable
                                exercise={ex}
                                onStartTimer={onStartTimer}
                                onSetUpdated={(updatedSet) => {
                                  if (selectedPlan) {
                                    const updatedExercises = selectedPlan.exercises.map(e => {
                                      if (e.id === ex.id) {
                                        return {
                                          ...e,
                                          workout_sets: (e.workout_sets || []).map(s => 
                                            s.id === updatedSet.id ? updatedSet : s
                                          )
                                        };
                                      }
                                      return e;
                                    });
                                    setSelectedPlan({ ...selectedPlan, exercises: updatedExercises });
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-slate-600 text-xs py-2">Список упражнений пуст</div>
                  )}
                </div>
                
                {selectedPlan.status !== 'completed' && (
                  <>
                    <button
                      onClick={() => setIsAddExModalOpen(true)}
                      className="w-full mt-3 py-1.5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-cyan-300 border border-dashed border-slate-700 hover:border-cyan-500/40 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> ДОБАВИТЬ УПРАЖНЕНИЕ
                    </button>
                    <button 
                      onClick={handleComplete}
                      className="w-full mt-2 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/40 rounded text-xs font-bold transition-colors"
                    >
                      ОТМЕТИТЬ КАК ВЫПОЛНЕНО
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-10 opacity-70">
              <Moon className="w-8 h-8 text-indigo-400/50 mb-3" />
              <div className="text-sm font-bold text-indigo-300">ДЕНЬ ВОССТАНОВЛЕНИЯ</div>
              <div className="text-[10px] text-slate-500 mt-2 max-w-[200px] leading-relaxed">
                Суперкомпенсация ЦНС. Рекомендуется увеличить сон до 8+ часов и добавить 40 мин прогулки.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Duplicate Modal */}
      {isDuplicateModalOpen && selectedPlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Copy className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-slate-200">Дублировать тренировку</h3>
              </div>
              <button onClick={() => setIsDuplicateModalOpen(false)} className="text-slate-400 hover:text-rose-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Дата новой тренировки</label>
                <input 
                  type="date" 
                  value={duplicateTargetDate}
                  onChange={e => setDuplicateTargetDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={applyOverload}
                      onChange={e => setApplyOverload(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5 rounded-full transition-colors ${applyOverload ? 'bg-cyan-500/30' : 'bg-slate-800'}`}>
                      <div className={`absolute top-1 left-1 w-3 h-3 rounded-full transition-transform ${applyOverload ? 'translate-x-5 bg-cyan-400' : 'bg-slate-500'}`} />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-slate-300 group-hover:text-slate-200">
                    Прогрессивная перегрузка
                  </span>
                </label>
                <p className="text-[10px] text-slate-500 mt-1 ml-12">
                  Увеличить рабочий вес в подходах (кроме разминки).
                </p>
              </div>

              {applyOverload && (
                <div className="pl-12 pt-1 flex gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="overload" checked={overloadIncrement === 1.25} onChange={() => setOverloadIncrement(1.25)} className="text-cyan-500 bg-slate-900 border-slate-700" />
                    <span className="text-xs text-slate-300">+1.25 кг</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="overload" checked={overloadIncrement === 2.5} onChange={() => setOverloadIncrement(2.5)} className="text-cyan-500 bg-slate-900 border-slate-700" />
                    <span className="text-xs text-slate-300">+2.5 кг</span>
                  </label>
                </div>
              )}

              <button 
                onClick={handleDuplicate}
                disabled={isDuplicating}
                className="w-full mt-2 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDuplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                {isDuplicating ? 'Копирование...' : 'Скопировать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Exercise Modal */}
      {isAddExModalOpen && selectedPlan && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <Plus className="w-4 h-4" /> Добавить упражнение
              </div>
              <button onClick={() => setIsAddExModalOpen(false)} className="text-slate-400 hover:text-rose-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase">Название упражнения</label>
                <input
                  type="text" autoFocus
                  value={newExName} onChange={e => setNewExName(e.target.value)}
                  placeholder="Жим штанги лёжа, Подтягивания..."
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase">Подходов</label>
                  <input type="number" min={1} max={10} value={newExSets} onChange={e => setNewExSets(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase">Повторов</label>
                  <input type="text" value={newExReps} onChange={e => setNewExReps(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase">RPE</label>
                  <input type="number" min={1} max={10} step={0.5} value={newExRpe} onChange={e => setNewExRpe(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
                </div>
              </div>
              <button
                onClick={handleAddExercise} disabled={isAddingEx || !newExName.trim()}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isAddingEx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isAddingEx ? 'Добавление...' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Exercise Modal */}
      {swapExId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <RefreshCw className="w-4 h-4" /> Заменить упражнение
              </div>
              <button onClick={() => setSwapExId(null)} className="text-slate-400 hover:text-rose-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase">Причина замены</label>
                <select value={swapReason} onChange={e => setSwapReason(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500">
                  <option value="joint_pain">Боль в суставах</option>
                  <option value="equipment_busy">Занят тренажёр</option>
                  <option value="no_axial_load">Без осевой нагрузки</option>
                  <option value="alternative">Биомеханическая альтернатива</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase">Новое упражнение</label>
                <input
                  type="text" autoFocus
                  value={swapNewName} onChange={e => setSwapNewName(e.target.value)}
                  placeholder="Например: Жим гантелей лёжа"
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                onClick={handleSwapExercise} disabled={isSwapping || !swapNewName.trim()}
                className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSwapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {isSwapping ? 'Замена...' : 'Заменить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
