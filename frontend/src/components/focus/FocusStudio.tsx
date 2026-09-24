import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  CheckCircle2, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Activity, 
  BrainCircuit, 
  Sparkles,
  AlertTriangle,
  X
} from 'lucide-react';
import { VoiceVisualizer } from '../chat/VoiceVisualizer';

interface Task {
  id: string;
  title: string;
  estimated_minutes: number;
  priority: string;
}

interface FocusStudioProps {
  activeTask?: Task | null;
  cnsScore?: number; // 0.0 - 10.0
  onCompleteSession: (taskId: string, actualMinutes: number) => Promise<void>;
  onExit: () => void;
}

export const FocusStudio: React.FC<FocusStudioProps> = ({
  activeTask,
  cnsScore = 8.5,
  onCompleteSession,
  onExit
}) => {
  // Адаптивный расчет длины сессии на основе ЦНС:
  // Если ЦНС высокая (>=8) — 50 минут, нормальная — 25 минут, низкая (<=4) — 15 минут
  const defaultDurationMinutes = cnsScore >= 8 ? 50 : cnsScore <= 4 ? 15 : 25;
  const totalSeconds = defaultDurationMinutes * 60;

  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [isActive, setIsActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft]);

  const toggleTimer = () => setIsActive(!isActive);

  const handleFinish = async () => {
    setIsActive(false);
    setIsCompleting(true);
    const spentMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    try {
      if (activeTask) {
        await onCompleteSession(activeTask.id, spentMinutes);
      }
    } finally {
      setIsCompleting(false);
      onExit();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPct = ((totalSeconds - timeLeft) / totalSeconds) * 100;
  const strokeDasharray = 2 * Math.PI * 45; // Circumference where r=45%
  const strokeDashoffset = strokeDasharray - (strokeDasharray * progressPct) / 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white/90 overflow-hidden font-sans">
      {/* Фоновый градиентный шум / Ambient Cyber Glow */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/30 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col h-full">
        {/* Верхний статус-бар биометрии и контекста */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Focus Studio <span className="text-indigo-400 font-mono text-sm ml-2 font-normal">v2.1</span>
            </h1>
            <span className="hidden sm:inline-block px-2 py-0.5 ml-2 text-xs font-medium tracking-wider text-indigo-300 border border-indigo-500/30 rounded bg-indigo-500/10">
              Когнитивный терминал
            </span>
          </div>

          <div className="flex items-center space-x-6">
            {/* Индикатор готовности ЦНС */}
            <div className="flex items-center space-x-2 text-sm font-mono border-r border-white/10 pr-6">
              <Activity className={`w-4 h-4 ${cnsScore >= 8 ? 'text-emerald-400' : cnsScore <= 4 ? 'text-rose-400' : 'text-amber-400'}`} />
              <span className="text-white/50 uppercase tracking-wider text-xs">CNS:</span>
              <strong className="text-white">{cnsScore.toFixed(1)}/10</strong>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/90 transition-colors"
                title={soundEnabled ? "Выключить фоновые частоты" : "Включить фоновые частоты"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                onClick={onExit}
                className="flex items-center space-x-1 p-2 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
                title="Закрыть терминал"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Центральный визуальный контур */}
        <main className="flex-1 flex flex-col items-center justify-center p-6 space-y-12">
          
          {/* Предупреждение о перегрузе ЦНС */}
          {cnsScore <= 4.0 && (
            <div className="flex items-center space-x-3 bg-rose-950/20 border border-rose-900/50 text-rose-400 px-4 py-3 rounded-xl max-w-xl text-center">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">
                Низкий тонус ЦНС. Длительность автоматически сокращена до 15 мин во избежание истощения.
              </p>
            </div>
          )}

          {/* Карточка текущей задачи */}
          <div className="text-center space-y-3">
            <h2 className="text-white/40 text-xs tracking-[0.2em] uppercase font-semibold">Текущий фокус дня</h2>
            <h3 className="text-3xl sm:text-4xl font-bold text-white max-w-2xl px-4 tracking-tight drop-shadow-md">
              {activeTask ? activeTask.title : "Свободная глубокая сессия (Deep Work)"}
            </h3>
            {activeTask && (
              <div className="flex items-center justify-center space-x-4 text-sm font-mono text-white/50">
                <span>План: {activeTask.estimated_minutes || defaultDurationMinutes} мин</span>
                <span>•</span>
                <span className={`px-2 py-0.5 rounded text-xs tracking-wider border ${
                  activeTask.priority?.toLowerCase() === 'high' 
                    ? 'border-rose-500/30 text-rose-400 bg-rose-500/10' 
                    : 'border-white/10 text-white/60 bg-white/5'
                }`}>
                  {activeTask.priority?.toUpperCase() || 'NORMAL'} PRIORITY
                </span>
              </div>
            )}
          </div>

          {/* Радиальный хронометр */}
          <div className="relative w-72 h-72 sm:w-96 sm:h-96 flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              {/* Базовая направляющая окружность */}
              <circle
                cx="50%"
                cy="50%"
                r="45%"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-white/10"
              />
              {/* Активная дуга прогресса */}
              <circle
                cx="50%"
                cy="50%"
                r="45%"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                className={`${cnsScore <= 4 ? 'text-amber-500' : 'text-indigo-500'} transition-all duration-1000 ease-linear`}
                style={{
                  strokeDasharray: `${strokeDasharray}%`,
                  strokeDashoffset: `${strokeDashoffset}%`,
                  filter: 'drop-shadow(0 0 8px currentColor)'
                }}
              />
            </svg>

            {/* Цифровой моноширинный таймер по центру */}
            <div className="relative flex flex-col items-center justify-center">
              <div className="text-7xl sm:text-8xl font-mono font-light tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                {formatTime(timeLeft)}
              </div>
              <div className={`mt-4 text-sm font-medium tracking-[0.2em] uppercase ${isActive ? 'text-indigo-400 animate-pulse' : 'text-white/40'}`}>
                {isActive ? 'Session Active' : 'Hold State'}
              </div>
            </div>
          </div>

          {/* Визуализатор звуковых частот (Canvas Spectrum из Фазы 3) */}
          <div className="h-16 w-64 max-w-full opacity-50 mix-blend-screen">
            {soundEnabled && isActive ? (
              <VoiceVisualizer width={256} height={64} />
            ) : (
              <div className="w-full h-full flex items-center justify-center space-x-1.5">
                {[...Array(16)].map((_, i) => (
                  <div key={i} className="w-1 h-1 rounded-full bg-white/20" />
                ))}
              </div>
            )}
          </div>

          {/* Панель управления (Controls) */}
          <div className="flex items-center space-x-6">
            <button
              onClick={toggleTimer}
              className={`flex items-center space-x-2 px-8 py-3.5 rounded-xl font-medium tracking-wider transition-all duration-300 ${
                isActive 
                  ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_25px_rgba(99,102,241,0.6)]'
              }`}
            >
              {isActive ? (
                <>
                  <Pause className="w-5 h-5" />
                  <span>ПАУЗА</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 ml-1" />
                  <span>ФОКУС</span>
                </>
              )}
            </button>

            <button
              onClick={handleFinish}
              disabled={isCompleting}
              className="flex items-center space-x-2 px-8 py-3.5 rounded-xl font-medium tracking-wider bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>ЗАВЕРШИТЬ</span>
            </button>
          </div>

        </main>

        {/* Нижняя телеметрия сессии */}
        <footer className="px-6 py-4 border-t border-white/10 bg-black/20 flex flex-col sm:flex-row items-center justify-between text-xs text-white/50 font-mono tracking-widest uppercase">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-400/50" />
              <span>Наработано: <strong className="text-white/90 text-sm ml-1">{Math.floor(elapsedSeconds / 60)} мин</strong></span>
            </div>
            <span>•</span>
            <div>
              <span>Расход ресурса: <strong className={`text-sm ml-1 ${cnsScore <= 4 ? 'text-rose-400' : 'text-indigo-400'}`}>
                {cnsScore <= 4 ? 'ПОВЫШЕННЫЙ' : 'ОПТИМАЛЬНЫЙ'}
              </strong></span>
            </div>
          </div>
          <div className="mt-2 sm:mt-0 flex items-center space-x-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span>Синхронизировано с PKA Core</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default FocusStudio;
