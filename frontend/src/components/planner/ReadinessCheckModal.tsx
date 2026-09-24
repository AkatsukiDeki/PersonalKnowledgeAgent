import React, { useState, useEffect, useRef } from 'react';
import { X, Activity, Brain, Battery, Check } from 'lucide-react';
import { ReadinessPayload, plannerApi } from '../../api/planner';

interface ReadinessCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (readiness: any) => void;
  isRetest?: boolean;
}

type Step = 'intro' | 'sleep' | 'subjective' | 'tapping' | 'result';

export const ReadinessCheckModal: React.FC<ReadinessCheckModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isRetest = false
}) => {
  const [step, setStep] = useState<Step>('intro');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Sleep
  const [sleepHours, setSleepHours] = useState<number>(7.5);
  const [sleepQuality, setSleepQuality] = useState<number>(3);

  // Subjective
  const [mentalClarity, setMentalClarity] = useState<number>(3);
  const [physicalFreshness, setPhysicalFreshness] = useState<number>(3);
  const [motivation, setMotivation] = useState<number>(3);

  // Tapping
  const [tappingCount, setTappingCount] = useState(0);
  const [isTappingActive, setIsTappingActive] = useState(false);
  const [tappingTimeLeft, setTappingTimeLeft] = useState(10);
  const tappingTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      setStep('intro');
      setSleepHours(7.5);
      setSleepQuality(3);
      setMentalClarity(3);
      setPhysicalFreshness(3);
      setMotivation(3);
      setTappingCount(0);
      setIsTappingActive(false);
      setTappingTimeLeft(10);
      setResult(null);
    }
    return () => {
      if (tappingTimerRef.current) clearInterval(tappingTimerRef.current);
    };
  }, [isOpen]);

  const handleTap = (e?: React.MouseEvent | React.TouchEvent | KeyboardEvent) => {
    if (e && e.type === 'keydown' && (e as KeyboardEvent).code !== 'Space') return;
    if (e) e.preventDefault();

    const now = Date.now();
    // Debounce 20ms to prevent double triggers
    if (now - lastTapRef.current < 20) return;
    lastTapRef.current = now;

    if (!isTappingActive && tappingTimeLeft === 10) {
      // Start test
      setIsTappingActive(true);
      setTappingCount(1);
      tappingTimerRef.current = setInterval(() => {
        setTappingTimeLeft(prev => {
          if (prev <= 1) {
            if (tappingTimerRef.current) clearInterval(tappingTimerRef.current);
            setIsTappingActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (isTappingActive) {
      setTappingCount(prev => prev + 1);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step === 'tapping' && e.code === 'Space') {
        handleTap(e);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, isTappingActive, tappingTimeLeft]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const payload: ReadinessPayload = {
        sleep_hours: sleepHours,
        sleep_quality: sleepQuality,
        tapping_count: tappingCount,
        mental_clarity: mentalClarity,
        physical_freshness: physicalFreshness,
        motivation: motivation,
        is_baseline: !isRetest
      };
      const res = await plannerApi.submitReadiness(payload);
      setResult(res);
      setStep('result');
      onSuccess(res);
    } catch (e) {
      console.error(e);
      alert('Failed to submit readiness');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-full">
        <div className="flex justify-between items-center p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Activity className="text-cyan-500" size={20} />
            <h2 className="text-lg font-bold text-white">
              {isRetest ? 'Тест ЦНС (Ретест)' : 'Утренний Чекап (Readiness)'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {step === 'intro' && (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm leading-relaxed">
                Для персонализации нагрузки и защиты от выгорания пройдите короткий чекап. Он займет менее минуты.
              </p>
              <div className="flex flex-col gap-3">
                <div className="bg-white/5 rounded-lg p-3 flex gap-3">
                  <Brain className="text-purple-400 mt-1 flex-shrink-0" size={18} />
                  <div>
                    <h4 className="text-sm font-medium text-white">Оценка сна</h4>
                    <p className="text-xs text-white/50">Субъективное качество и длительность</p>
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 flex gap-3">
                  <Battery className="text-amber-400 mt-1 flex-shrink-0" size={18} />
                  <div>
                    <h4 className="text-sm font-medium text-white">Тест ЦНС (Tapping)</h4>
                    <p className="text-xs text-white/50">10 секунд на измерение тонуса моторной коры</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setStep('sleep')}
                className="w-full py-3 mt-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors"
              >
                Начать чекап
              </button>
            </div>
          )}

          {step === 'sleep' && (
            <div className="space-y-6">
              <div>
                <label className="text-sm text-slate-300 block mb-2">Сколько часов вы спали?</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" min="3" max="12" step="0.5" 
                    value={sleepHours} 
                    onChange={(e) => setSleepHours(Number(e.target.value))}
                    className="flex-1 accent-cyan-500"
                  />
                  <span className="text-xl font-bold text-white w-12 text-right">{sleepHours}ч</span>
                </div>
              </div>
              
              <div>
                <label className="text-sm text-slate-300 block mb-2">Качество сна (1-5)</label>
                <div className="flex justify-between gap-2">
                  {[1, 2, 3, 4, 5].map(val => (
                    <button
                      key={val}
                      onClick={() => setSleepQuality(val)}
                      className={`flex-1 py-3 rounded-lg border transition-all ${sleepQuality === val ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold' : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/5'}`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-white/40 mt-1">
                  <span>Ужасно</span>
                  <span>Отлично</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setStep('intro')} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white">Назад</button>
                <button onClick={() => setStep('subjective')} className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white font-medium">Далее</button>
              </div>
            </div>
          )}

          {step === 'subjective' && (
            <div className="space-y-6">
              <h3 className="text-sm font-medium text-white mb-2">Субъективная оценка (САН)</h3>
              
              <div>
                <label className="text-xs text-slate-400 block mb-2 flex justify-between">
                  <span>Ментальная ясность</span>
                  <span className="text-white font-bold">{mentalClarity}/5</span>
                </label>
                <input 
                  type="range" min="1" max="5" step="1" 
                  value={mentalClarity} 
                  onChange={(e) => setMentalClarity(Number(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-2 flex justify-between">
                  <span>Мышечная свежесть</span>
                  <span className="text-white font-bold">{physicalFreshness}/5</span>
                </label>
                <input 
                  type="range" min="1" max="5" step="1" 
                  value={physicalFreshness} 
                  onChange={(e) => setPhysicalFreshness(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-2 flex justify-between">
                  <span>Мотивация к сложным задачам</span>
                  <span className="text-white font-bold">{motivation}/5</span>
                </label>
                <input 
                  type="range" min="1" max="5" step="1" 
                  value={motivation} 
                  onChange={(e) => setMotivation(Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setStep('sleep')} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white">Назад</button>
                <button onClick={() => setStep('tapping')} className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white font-medium">К тесту ЦНС</button>
              </div>
            </div>
          )}

          {step === 'tapping' && (
            <div className="flex flex-col items-center justify-center space-y-6 py-4">
              <div className="text-center">
                <h3 className="text-lg font-bold text-white mb-1">Tapping Test</h3>
                <p className="text-sm text-slate-400">
                  Как можно быстрее нажимайте на кнопку (или Пробел) в течение 10 секунд.
                </p>
              </div>

              <div className="text-4xl font-mono font-bold text-cyan-400">
                00:{tappingTimeLeft.toString().padStart(2, '0')}
              </div>

              <button
                onMouseDown={handleTap}
                onTouchStart={handleTap}
                disabled={tappingTimeLeft === 0}
                className="w-48 h-48 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_30px_rgba(139,92,246,0.3)] flex flex-col items-center justify-center transition-transform active:scale-95 select-none disabled:opacity-50 disabled:active:scale-100"
                style={{ touchAction: 'manipulation' }}
              >
                <span className="text-5xl font-bold text-white">{tappingCount}</span>
                {!isTappingActive && tappingTimeLeft === 10 && <span className="text-white/70 text-sm mt-2">TAP TO START</span>}
              </button>

              <div className="w-full flex gap-3 pt-4">
                <button onClick={() => setStep('subjective')} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white">Назад</button>
                <button 
                  onClick={handleSubmit} 
                  disabled={isSubmitting || tappingTimeLeft > 0} 
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-white font-medium flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Анализ...' : 'Завершить'}
                </button>
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-6 text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mb-2">
                <Check size={32} />
              </div>
              <h3 className="text-xl font-bold text-white">Готово!</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-xl">
                  <div className="text-sm text-white/50 mb-1">Сон (Sleep Score)</div>
                  <div className={`text-2xl font-bold ${result.sleep_score >= 8 ? 'text-emerald-400' : result.sleep_score >= 5 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {result.sleep_score.toFixed(1)} <span className="text-sm text-white/30">/ 10</span>
                  </div>
                </div>
                <div className="bg-white/5 p-4 rounded-xl">
                  <div className="text-sm text-white/50 mb-1">ЦНС (CNS Score)</div>
                  <div className={`text-2xl font-bold ${result.cns_score >= 8 ? 'text-emerald-400' : result.cns_score >= 5 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {result.cns_score.toFixed(1)} <span className="text-sm text-white/30">/ 10</span>
                  </div>
                </div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-sm text-slate-300">
                {result.cns_score >= 8 
                  ? 'Отличное восстановление! Идеальный день для тяжелых спринтов и тренировок.' 
                  : result.cns_score >= 5 
                    ? 'Умеренное утомление. Распределяйте нагрузку равномерно.'
                    : 'Низкий ресурс ЦНС. Рекомендуется отдых, легкая рутина и смещение дедлайнов.'}
              </div>

              <button 
                onClick={onClose}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors mt-4"
              >
                Вернуться к планировщику
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
