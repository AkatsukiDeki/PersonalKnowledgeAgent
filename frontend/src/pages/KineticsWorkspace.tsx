import React, { useEffect, useState } from 'react';
import { HeartPulse, Flame, Zap, ShieldAlert, CheckCircle2, Circle, RefreshCw, Timer, Layers, ArrowLeftRight, Activity, X, Plus, Sparkles, Bot, BookOpen, Dumbbell, Download } from 'lucide-react';
import { kineticsApi, BiometricsLog, WorkoutPlan } from '../api/kinetics';
import { HoloBodyMap } from '../components/kinetics/HoloBodyMap';
import { KineticsChat } from '../components/kinetics/KineticsChat';
import { SegmentDetailedView } from '../components/kinetics/SegmentDetailedView';
import { KineticsCalendar } from '../components/kinetics/KineticsCalendar';
import { KineticsAnalytics } from '../components/kinetics/KineticsAnalytics';
import { KineticsNutrition } from '../components/kinetics/KineticsNutrition';
import { KineticsJournal } from '../components/kinetics/KineticsJournal';
import { RestTimerWidget } from '../components/kinetics/RestTimerWidget';

import { UserCheck } from 'lucide-react';
import { AthleteProfileModal } from '../components/kinetics/AthleteProfileModal';

interface KineticsWorkspaceProps {
  onClose?: () => void;
}

export const KineticsWorkspace: React.FC<KineticsWorkspaceProps> = ({ onClose }) => {
  const [biometrics, setBiometrics] = useState<BiometricsLog[]>([]);
  const [currentPlan, setCurrentPlan] = useState<WorkoutPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'training' | 'anatomy' | 'calendar' | 'analytics' | 'nutrition' | 'journal'>('training');
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);

  const [restTimerTarget, setRestTimerTarget] = useState<number | null>(null);

  const handleStartRestTimer = (seconds: number) => {
    setRestTimerTarget(Date.now() + seconds * 1000);
  };

  const handleAddRestTime = (seconds: number) => {
    setRestTimerTarget(prev => prev ? prev + seconds * 1000 : null);
  };

  const handleCloseRestTimer = () => {
    setRestTimerTarget(null);
  };


  // Plan Settings Form
  const [viewMode, setViewMode] = useState<'chat' | 'settings'>('chat');
  const [settingsLocation, setSettingsLocation] = useState<string>('Дом');
  const [settingsSplit, setSettingsSplit] = useState<string>('Кор / Плечи / Шея');
  const [settingsRestrictions, setSettingsRestrictions] = useState<string>('');
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  useEffect(() => {
    if (currentPlan) {
      setSettingsLocation((currentPlan as any).location || 'Дом');
      setSettingsSplit((currentPlan as any).target_split || (currentPlan as any).split_day || 'Кор / Плечи / Шея');
    }
  }, [currentPlan]);

  const handleSaveSettings = async () => {
    if (!currentPlan) return;
    setIsSavingSettings(true);
    try {
      const updated = await kineticsApi.updateWorkoutPlanSettings({
        plan_id: currentPlan.id,
        location: settingsLocation,
        target_split: settingsSplit,
        split_day: settingsSplit,
        restrictions: settingsRestrictions
      });
      setCurrentPlan(updated);
      setViewMode('chat');
    } catch (error) {
      console.error('Ошибка сохранения настроек плана:', error);
    } finally {
      setIsSavingSettings(false);
    }
  };


  const [swappingExerciseId, setSwappingExerciseId] = useState<string | null>(null);
  const [swapReason, setSwapReason] = useState<'joint_pain' | 'no_axial_load' | 'equipment_busy' | 'too_intense'>('joint_pain');
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [flashingExerciseId, setFlashingExerciseId] = useState<string | null>(null);

  const handleOpenSwapPopover = async (exerciseId: string) => {
    if (swappingExerciseId === exerciseId) {
      setSwappingExerciseId(null);
      return;
    }
    setSwappingExerciseId(exerciseId);
    setIsLoadingAlternatives(true);
    try {
      const alts = await kineticsApi.getExerciseAlternatives(exerciseId, swapReason);
      setAlternatives(alts);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingAlternatives(false);
    }
  };

  const handleApplySwap = async (exerciseId: string, alt: any) => {
    try {
      const updated = await kineticsApi.swapExercise(exerciseId, {
        exercise_name: alt.exercise_name,
        exercise_type: alt.exercise_type,
        sets: alt.sets,
        reps_or_duration: alt.reps_or_duration,
        rpe_target: alt.rpe_target,
        target_muscle_groups: alt.target_muscle_groups
      });

      if (currentPlan) {
        setCurrentPlan({
          ...currentPlan,
          exercises: currentPlan.exercises.map(ex => ex.id === exerciseId ? updated : ex)
        });
      }

      setSwappingExerciseId(null);
      setFlashingExerciseId(exerciseId);
      setTimeout(() => setFlashingExerciseId(null), 1200);
    } catch (err) {
      console.error('Ошибка применения замены:', err);
    }
  };



  // Bio Modal
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [bioForm, setBioForm] = useState({
    weight: 100.7,
    body_fat_percentage: 29.4,
    fat_mass_kg: 29.6,
    skeletal_muscle_kg: 41.0,
    water_l: 51.8,
    protein_kg: 14.3,
    minerals_kg: 5.0,
    visceral_fat_level: 11,
    bmr_kcal: 1906,
    bmi: 30.7,
    calories_in: 2200,
    fatigue_score: 5,
    sleep_hours: 8,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [bioData, planData] = await Promise.all([
        kineticsApi.getBiometrics(7),
        kineticsApi.getLatestWorkout().catch(() => null)
      ]);
      setBiometrics(bioData);
      setCurrentPlan(planData);
    } catch (err) {
      console.error('Ошибка загрузки телеметрии:', err);
    }
  };

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    try {
      const newPlan = await kineticsApi.generateWorkout({
        location: settingsLocation as 'Дом' | 'Зал',
        split_day: settingsSplit,
        target_split: settingsSplit
      });
      setCurrentPlan(newPlan);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleExercise = async (id: string, currentStatus: boolean) => {
    if (!currentPlan) return;
    const updatedExercises = currentPlan.exercises.map((ex) =>
      ex.id === id ? { ...ex, is_completed: !currentStatus } : ex
    );
    setCurrentPlan({ ...currentPlan, exercises: updatedExercises });
    try {
        await kineticsApi.toggleExercise(id, !currentStatus);
    } catch (e) {
        // revert on failure optionally
    }
  };

  const handleSaveBio = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await kineticsApi.logBiometrics(bioForm as any);
      setIsBioModalOpen(false);
      await loadDashboardData();
    } catch (err) {
      console.error('Ошибка сохранения биометрии:', err);
    }
  };

  // 1. Нормализация извлечения данных из latestBio
  const latestBio = biometrics.length > 0 ? biometrics[0] : null;

  const bmrVal = Number(latestBio?.bmr_kcal || latestBio?.bmr || 1906);
  const caloriesIn = Number(latestBio?.calories_in || 2200);
  const weightVal = Number(latestBio?.weight || latestBio?.weight_kg || 100.7);

  // Безопасное чтение массы мышц и жира с фоллбеком на процент
  const muscleVal = Number(
    latestBio?.skeletal_muscle_kg || 
    latestBio?.muscle_kg || 
    41.0
  );

  const fatVal = Number(
    latestBio?.fat_mass_kg || 
    (latestBio?.body_fat_percentage ? (weightVal * Number(latestBio.body_fat_percentage)) / 100 : 29.6)
  );

  const waterVal = Number(latestBio?.water_l || 51.8);
  const proteinMineralsVal = Number((latestBio?.protein_kg || 14.3) + (latestBio?.minerals_kg || 5.0));

  // Расчет баланса: Потребление - Расход (TDEE или BMR * 1.2)
  const tdeeVal = Number(latestBio?.tdee) > 0 ? Number(latestBio?.tdee) : Math.round(bmrVal * 1.35); // ~2570 ккал
  const energyBalance = caloriesIn - tdeeVal; // 2200 - 2570 = -370 ккал (честный дефицит)

  // Calculate muscle load based on current plan
  const activeMuscles: string[] = [];
    if (currentPlan) {
      currentPlan.exercises.forEach(ex => {
        const groups = Array.isArray(ex.target_muscle_groups) ? ex.target_muscle_groups : (ex.target_muscle_groups ? [ex.target_muscle_groups] : []);
        groups.forEach((group: any) => {
          activeMuscles.push(group as string);
        });
      });
    }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 select-none">
      {/* САМО ОКНО ВОРКСПЕЙСА: Раскрываем до 96vw и 95vh */}
      <div className="w-[96vw] max-w-[1780px] h-[95vh] bg-[#030712] text-slate-100 border border-cyan-950/80 rounded-2xl flex flex-col overflow-hidden shadow-[0_0_50px_rgba(3,7,18,0.95)]">
        
        {/* ШАПКА ВОРКСПЕЙСА (Теперь легко вмещает все вкладки и контролы) */}
        <div className="border-b border-cyan-950/80 bg-[#030712] px-5 py-3 flex items-center justify-between gap-4 font-mono shrink-0">
          
          {/* Логотип */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-black tracking-widest text-slate-100 flex items-center gap-2">
                KINETICS <span className="text-[10px] text-cyan-400 font-normal">// ТЕЛЕМЕТРИЯ</span>
              </div>
              <div className="text-[9px] text-slate-500">РЕГУЛЯТОР НАГРУЗКИ И АДАПТАЦИИ</div>
            </div>
          </div>

          {/* 6 Вкладок навигации — с комфортными отступами */}
          <div className="flex bg-[#090d16] p-1 rounded-xl border border-slate-800 text-xs shrink-0">
            {[
              { id: 'training', label: 'ПРОТОКОЛ И ЧАТ' },
              { id: 'anatomy', label: 'АНАТОМИЯ / INBODY' },
              { id: 'calendar', label: 'КАЛЕНДАРЬ' },
              { id: 'analytics', label: 'ДИНАМИКА' },
              { id: 'nutrition', label: 'ПИТАНИЕ' },
              { id: 'journal', label: 'ДНЕВНИК И НАУКА' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Правая часть шапки: Синтез + Закрыть */}
          <div className="flex items-center gap-3 shrink-0">

            {/* Кнопка экспорта в Excel */}
            <button
              onClick={() => {
                window.open('/api/v1/kinetics/export/excel', '_blank');
              }}
              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-lg transition-all shadow-[0_0_15px_rgba(79,70,229,0.4)]"
              title="Экспорт всех данных в .xlsx"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ЭКСПОРТ</span>
            </button>

            {/* Кнопка синтеза */}
            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black rounded-lg transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'СИНТЕЗ...' : 'СИНТЕЗ'}</span>
            </button>

            {/* Крестик закрытия */}
            <button
              onClick={() => {
                if (onClose) {
                  onClose();
                } else {
                  window.history.back();
                }
              }}
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors ml-1"
              title="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ОСНОВНОЕ ТЕЛО ВОРКСПЕЙСА (Двухколоночный flex-1) */}
        <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-hidden">
        {activeTab === 'training' && (
          <>
            {/* Левая колонка: Протокол */}
            <div className="flex-1 shrink-0 bg-[#090d16] border border-slate-800/80 rounded-xl p-4 flex flex-col font-mono h-full min-w-0">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400">ПРОТОКОЛ:</span>
                  <span className="text-xs font-mono text-cyan-400 font-bold">{settingsSplit}</span>
                  
                  {/* Переключатель режимов */}
                  <div className="flex items-center bg-slate-900/80 p-0.5 rounded border border-slate-700 ml-3">
                    <button
                      onClick={() => setViewMode('chat')}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors ${
                        viewMode === 'chat'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      УПРАЖНЕНИЯ
                    </button>
                    <button
                      onClick={() => setViewMode('settings')}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors flex items-center gap-1 ${
                        viewMode === 'settings'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>⚙</span> ПАРАМЕТРЫ ПЛАНА
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {viewMode === 'chat' && (
                    <button
                      onClick={async () => {
                        if (!currentPlan) return;
                        const name = prompt('Название нового упражнения:');
                        if (name) {
                          const added = await kineticsApi.addExercise(currentPlan.id, name);
                          setCurrentPlan({
                            ...currentPlan,
                            exercises: [...currentPlan.exercises, added]
                          });
                        }
                      }}
                      className="px-2 py-0.5 text-[10px] bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 rounded hover:bg-cyan-500/20"
                    >
                      + ДОБАВИТЬ
                    </button>
                  )}
                  <span className="text-[10px] text-cyan-400">{currentPlan?.exercises?.length || 0} УПР.</span>
                </div>
              </div>

              {viewMode === 'chat' ? (
                <>
                  {(!currentPlan || currentPlan.exercises.length === 0) ? (
                    <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-cyan-950 rounded-xl p-8 bg-[#090d16]/40 font-mono text-center my-auto">
                      <div className="w-12 h-12 rounded-full bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                        <Dumbbell className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-bold text-slate-200">ПРОТОКОЛ НА СЕГОДНЯ НЕ СФОРМИРОВАН</div>
                      <div className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                        Система готова рассчитать биомеханический объем под параметры атлета ({settingsLocation.toUpperCase()}, фокус: {settingsSplit}).
                      </div>
                  
                      <div className="flex items-center gap-3 mt-5">
                        <button
                          onClick={handleGeneratePlan}
                          disabled={isGenerating}
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                        >
                          <Sparkles className="w-4 h-4" />
                          СГЕНЕРИРОВАТЬ ПЛАН ЧЕРЕЗ AI
                        </button>
                        <button
                          onClick={() => setIsAddExerciseModalOpen(true)}
                          className="px-4 py-2 bg-[#030712] hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded-lg text-xs flex items-center gap-2 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                          ДОБАВИТЬ ВРУЧНУЮ
                        </button>
                      </div>
                  
                      <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center gap-4 text-xs text-slate-400">
                        <span>База знаний:</span>
                        <button
                          onClick={() => setActiveTab('journal')}
                          className="text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                        >
                          <BookOpen className="w-3.5 h-3.5" /> Открыть исследования и источники →
                        </button>
                      </div>
                    </div>
                  ) : (
                  <div className="flex-1 overflow-y-auto mt-1 custom-scrollbar pr-2">
                    {currentPlan?.exercises?.map((item) => (
                      <div
                        key={item.id}
                        className={`flex flex-col border-b border-slate-800/40 transition-colors ${
                          flashingExerciseId === item.id ? 'bg-cyan-900/60 shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <div className="flex items-center justify-between py-2 px-1">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <button onClick={() => handleToggleExercise(item.id, item.is_completed)}>
                              {item.is_completed ? <CheckCircle2 className="w-4 h-4 text-cyan-500" /> : <Circle className="w-4 h-4 text-slate-600" />}
                            </button>
                            <span className={`text-xs ${item.is_completed ? 'line-through text-slate-500' : 'text-slate-200 font-bold'}`}>
                              {item.exercise_name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span>{item.sets} × {item.reps_or_duration}</span>
                            <span className="text-cyan-400">RPE {item.rpe_target ?? 7}</span>

                            {/* Кнопка альтернативы */}
                            <button
                              type="button"
                              title="Подобрать безопасную альтернативу"
                              onClick={() => handleOpenSwapPopover(item.id)}
                              className={`p-1 rounded transition-all ${
                                swappingExerciseId === item.id
                                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                                  : 'text-cyan-400 hover:bg-cyan-950/60 border border-cyan-500/30'
                              }`}
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => kineticsApi.deleteExercise(item.id).then(() => {
                                if (currentPlan) setCurrentPlan({ ...currentPlan, exercises: currentPlan.exercises.filter(e => e.id !== item.id) });
                              })}
                              className="text-slate-600 hover:text-rose-400 px-1"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Всплывающий Popover выбора альтернативы */}
                        {swappingExerciseId === item.id && (
                          <div className="p-3 my-1.5 bg-[#020617] border border-cyan-500/40 rounded-lg space-y-2.5 font-mono shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                            <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-1.5">
                              <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                AI ADVISOR // ПОДБОР БЕЗОПАСНОЙ АЛЬТЕРНАТИВЫ
                              </span>
                              <button onClick={() => setSwappingExerciseId(null)} className="text-slate-500 hover:text-slate-300">✕</button>
                            </div>

                            {/* Причина замены */}
                            <div className="flex flex-wrap gap-1.5 text-[10px]">
                              {[
                                { id: 'joint_pain', label: 'Боль в суставах' },
                                { id: 'no_axial_load', label: 'Исключить осевую' },
                                { id: 'equipment_busy', label: 'Тренажер занят' },
                                { id: 'too_intense', label: 'Слишком тяжело' }
                              ].map(r => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={async () => {
                                    setSwapReason(r.id as any);
                                    setIsLoadingAlternatives(true);
                                    const alts = await kineticsApi.getExerciseAlternatives(item.id, r.id as any);
                                    setAlternatives(alts);
                                    setIsLoadingAlternatives(false);
                                  }}
                                  className={`px-2 py-0.5 rounded border transition-all ${
                                    swapReason === r.id
                                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500 font-bold'
                                      : 'border-slate-800 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {r.label}
                                </button>
                              ))}
                            </div>

                            {/* Карточки сгенерированных замен */}
                            <div className="space-y-2 pt-1">
                              {isLoadingAlternatives ? (
                                <div className="text-center py-3 text-xs text-cyan-400 animate-pulse">
                                  Анализ кинематической цепи и биомеханики...
                                </div>
                              ) : alternatives.map((alt, idx) => (
                                <div key={idx} className="p-2.5 bg-[#090d16] border border-slate-800 rounded flex justify-between items-start gap-2">
                                  <div className="flex-1">
                                    <div className="text-xs font-bold text-slate-100">{alt.exercise_name}</div>
                                    <div className="text-[10px] text-cyan-400 mt-0.5">
                                      {alt.sets} сета × {alt.reps_or_duration} | Целевой RPE: {alt.rpe_target}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1 leading-relaxed bg-[#020617] p-1.5 rounded border border-slate-800/80">
                                      {alt.biomechanical_rationale}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleApplySwap(item.id, alt)}
                                    className="px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 rounded text-xs font-bold transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)] shrink-0"
                                  >
                                    Применить
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  )}
                </>
              ) : (
                <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4 font-mono text-xs overflow-y-auto custom-scrollbar">
                  <div>
                    <label className="block text-slate-400 mb-1">ЛОКАЦИЯ ТРЕНИРОВКИ</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Дом', 'Зал'].map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => setSettingsLocation(loc)}
                          className={`py-2 text-center rounded border transition-all ${
                            settingsLocation === loc
                              ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">АКТИВНЫЙ СПЛИТ</label>
                    <select
                      value={settingsSplit}
                      onChange={(e) => setSettingsSplit(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                    >
                      <option value="Кор / Плечи / Шея">Кор / Плечи / Шея</option>
                      <option value="Грудь / Трицепс">Грудь / Трицепс</option>
                      <option value="Спина / Бицепс">Спина / Бицепс</option>
                      <option value="Ноги / Функционал">Ноги / Функционал</option>
                      <option value="Фулбоди">Фулбоди</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">ОГРАНИЧЕНИЯ И ЗАМЕТКИ ДЛЯ ИИ</label>
                    <textarea
                      value={settingsRestrictions}
                      onChange={(e) => setSettingsRestrictions(e.target.value)}
                      placeholder="Например: без осевой нагрузки на поясницу, легкий дискомфорт в левом плече..."
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 placeholder-slate-600 focus:border-cyan-500 outline-none resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => setViewMode('chat')}
                      className="px-4 py-2 rounded border border-slate-700 text-slate-400 hover:text-slate-200"
                    >
                      ОТМЕНА
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSettings}
                      disabled={isSavingSettings}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded transition-colors disabled:opacity-50"
                    >
                      {isSavingSettings ? 'СОХРАНЕНИЕ...' : 'ПРИМЕНИТЬ ПАРАМЕТРЫ'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Правая колонка: Чат (компактный w-72) */}
            <div className="w-72 shrink-0 h-full">
              <KineticsChat currentPlan={currentPlan} location={settingsLocation as 'Дом' | 'Зал'} onPlanMutated={setCurrentPlan} onOpenJournal={() => setActiveTab('journal')} />
            </div>
          </>
        )}

        {activeTab === 'anatomy' && (
          <>
            <div className="w-80 flex flex-col gap-3 min-h-0 overflow-y-auto pr-1 custom-scrollbar shrink-0">
              <div className="bg-[#090d16] border border-slate-800 rounded p-4 font-mono">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  ЦЕЛЕВОЙ ДЕФИЦИТ <Flame className="w-4 h-4 text-amber-500" />
                </div>
                <div className={`text-2xl font-bold mt-2 ${energyBalance < 0 ? 'text-cyan-400' : 'text-amber-400'}`}>
                  {energyBalance > 0 ? `+${energyBalance}` : energyBalance} <span className="text-xs font-normal text-slate-400">ккал</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  In: {caloriesIn} / TDEE: {tdeeVal} (BMR: {bmrVal})
                </div>
              </div>

              <div className="bg-[#090d16] border border-slate-800 rounded p-4 font-mono">
                <div className="text-xs text-slate-400">СОСТАВ ТЕЛА</div>
                <div className="text-2xl font-bold text-slate-100 mt-2">
                  {weightVal} <span className="text-xs font-normal text-slate-400">кг</span>
                </div>
                
                <div className="mt-3 flex h-3 w-full rounded-full overflow-hidden bg-slate-800 relative">
                  <div style={{ width: `${(muscleVal / weightVal) * 100}%` }} className="bg-cyan-500" title="Мышцы" />
                  <div style={{ width: `${(fatVal / weightVal) * 100}%` }} className="bg-amber-500" title="Жир" />
                  <div style={{ width: `${(waterVal / weightVal) * 100}%` }} className="bg-blue-400" title="Вода" />
                  <div style={{ width: `${(proteinMineralsVal / weightVal) * 100}%` }} className="bg-emerald-500" title="Белок+Мин" />
                </div>
                
                <div className="flex justify-between mt-2 text-[9px] text-slate-400">
                  <span className="text-cyan-400">М: {muscleVal.toFixed(1)}кг</span>
                  <span className="text-amber-500">Ж: {fatVal.toFixed(1)}кг</span>
                  <span className="text-blue-400">В: {waterVal.toFixed(1)}л</span>
                </div>
              </div>

              <div className="bg-[#090d16] border border-slate-800 rounded p-4 font-mono">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  УТОМЛЕНИЕ ЦНС <ShieldAlert className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-indigo-300 mt-2">
                  {latestBio?.fatigue_score || 0} <span className="text-xs font-normal text-slate-500">/ 10</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Сон: {latestBio?.sleep_hours || '--'} ч</div>
              </div>

              <button
                type="button"
                onClick={() => setIsBioModalOpen(true)}
                className="w-full mt-2 text-xs font-mono text-cyan-400 border border-cyan-900/60 border-dashed rounded p-3 text-center cursor-pointer hover:bg-cyan-950/30 hover:border-cyan-500/50 transition-all"
              >
                + Ввести биометрию
              </button>

              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="w-full mt-2 text-xs font-mono text-cyan-300 border border-cyan-500/40 bg-cyan-950/20 rounded p-2.5 text-center cursor-pointer hover:bg-cyan-950/40 transition-all flex items-center justify-center gap-2"
              >
                <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                Анкета атлета (Цели / Лимиты)
              </button>
            </div>

            <div className="flex-1 relative min-h-0 h-full bg-[#020617] border border-cyan-950/60 rounded-xl overflow-hidden flex items-center justify-center shadow-[inset_0_0_40px_rgba(6,182,212,0.05)]">
              {(() => {
                if (selectedSegment) {
                  const getBioKey = (id: string) => {
                    if (id.includes('arm') || id === 'biceps' || id === 'triceps' || id === 'forearms') return id.includes('right') ? 'right_arm' : 'left_arm';
                    if (id.includes('quad') || id.includes('calv') || id.includes('hamstring') || id.includes('leg') || id === 'glutes') {
                      return id.includes('right') ? 'right_leg' : 'left_leg';
                    }
                    return 'torso';
                  };
                  
                  const bioKey = getBioKey(selectedSegment || '');

                  const defaultSegments: Record<string, { muscle_kg: number; muscle_pct: number; fat_kg: number; fat_pct: number }> = {
                    torso: { muscle_kg: 31.4, muscle_pct: 104.2, fat_kg: 14.8, fat_pct: 185.0 },
                    right_arm: { muscle_kg: 4.3, muscle_pct: 108.3, fat_kg: 2.1, fat_pct: 145.0 },
                    left_arm: { muscle_kg: 4.2, muscle_pct: 106.0, fat_kg: 2.1, fat_pct: 145.0 },
                    right_leg: { muscle_kg: 10.8, muscle_pct: 102.5, fat_kg: 5.3, fat_pct: 152.0 },
                    left_leg: { muscle_kg: 10.7, muscle_pct: 101.8, fat_kg: 5.3, fat_pct: 152.0 },
                  };

                  const segData: any = latestBio?.segment_data?.[bioKey] || defaultSegments[bioKey] || defaultSegments.torso;
                    const relatedExs = currentPlan?.exercises?.filter(ex => {
                      const groups = Array.isArray(ex.target_muscle_groups) ? ex.target_muscle_groups : (ex.target_muscle_groups ? [ex.target_muscle_groups] : []);
                      return groups.some((m: string) => m.toLowerCase().includes(selectedSegment.split('_')[0]));
                    }) || [];

                  return (
                    <SegmentDetailedView
                      segmentId={selectedSegment || 'torso'}
                      exercises={currentPlan?.exercises || []}
                      location={settingsLocation as 'Дом' | 'Зал'}
                      onBack={() => setSelectedSegment(null)}
                    />
                  );
                }

                return (
                  <HoloBodyMap
                    activeLayer={'load'}
                    segmentFat={latestBio?.segment_data}
                    activeMuscles={activeMuscles}
                    fatigueScore={latestBio?.fatigue_score || 0}
                    selectedSegment={selectedSegment}
                    onSelectSegment={setSelectedSegment}
                  />
                );
              })()}
            </div>
          </>
        )}

        {activeTab === 'calendar' && (
          <div className="flex-1 h-full min-w-0">
            <KineticsCalendar 
              selectedDate={selectedDate} 
              onDateSelect={setSelectedDate} 
              onStartTimer={handleStartRestTimer} 
            />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="flex-1 h-full min-w-0">
            <KineticsAnalytics biometrics={biometrics} />
          </div>
        )}

        {activeTab === 'nutrition' && (
          <div className="flex-1 h-full min-w-0">
            <KineticsNutrition selectedDate={selectedDate} />
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="flex-1 h-full min-w-0">
            <KineticsJournal />
          </div>
        )}


      </div>

      {isBioModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#090d16] border border-cyan-500/40 rounded-xl p-6 w-full max-w-md font-mono text-slate-200 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-cyan-400">ВВОД БИОМЕТРИЧЕСКОЙ ТЕЛЕМЕТРИИ</h3>
              <button onClick={() => setIsBioModalOpen(false)} className="text-slate-500 hover:text-slate-300">✕</button>
            </div>

            <form onSubmit={handleSaveBio} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Вес (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bioForm.weight}
                    onChange={(e) => setBioForm({ ...bioForm, weight: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Процент жира (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bioForm.body_fat_percentage}
                    onChange={(e) => setBioForm({ ...bioForm, body_fat_percentage: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Мышцы (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bioForm.skeletal_muscle_kg}
                    onChange={(e) => setBioForm({ ...bioForm, skeletal_muscle_kg: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Жир (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bioForm.fat_mass_kg}
                    onChange={(e) => setBioForm({ ...bioForm, fat_mass_kg: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Вода (л)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bioForm.water_l}
                    onChange={(e) => setBioForm({ ...bioForm, water_l: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Белок (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bioForm.protein_kg}
                    onChange={(e) => setBioForm({ ...bioForm, protein_kg: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Мин. (кг)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bioForm.minerals_kg}
                    onChange={(e) => setBioForm({ ...bioForm, minerals_kg: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Висц. Жир</label>
                  <input
                    type="number"
                    value={bioForm.visceral_fat_level}
                    onChange={(e) => setBioForm({ ...bioForm, visceral_fat_level: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">BMR (ккал)</label>
                  <input
                    type="number"
                    value={bioForm.bmr_kcal}
                    onChange={(e) => setBioForm({ ...bioForm, bmr_kcal: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Калории In</label>
                  <input
                    type="number"
                    value={bioForm.calories_in}
                    onChange={(e) => setBioForm({ ...bioForm, calories_in: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#020617] border border-slate-800 rounded p-2 text-slate-200 focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBioModalOpen(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:bg-slate-800"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30"
                >
                  Фиксировать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AthleteProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={loadDashboardData}
      />
      </div>

      <RestTimerWidget 
        targetTime={restTimerTarget} 
        onClose={handleCloseRestTimer} 
        onAddTime={handleAddRestTime} 
      />
    </div>
  );
};
