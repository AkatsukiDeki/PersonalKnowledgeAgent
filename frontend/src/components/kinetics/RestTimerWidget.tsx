import React, { useEffect, useState, useRef } from 'react';
import { Timer, X, Plus, Minus } from 'lucide-react';

export interface RestTimerWidgetProps {
  targetTime: number | null;
  onClose: () => void;
  onAddTime: (seconds: number) => void;
}

export const RestTimerWidget: React.FC<RestTimerWidgetProps> = ({ targetTime, onClose, onAddTime }) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beepPlayedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!targetTime) return;

    // Reset state when a new target is set
    setIsFinished(false);
    beepPlayedRef.current = false;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((targetTime - now) / 1000));
      
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setIsFinished(true);
        if (!beepPlayedRef.current) {
          playBeep();
          beepPlayedRef.current = true;
        }
        clearInterval(interval);
      }
    }, 200); // 200ms for responsiveness

    return () => clearInterval(interval);
  }, [targetTime]);

  const playBeep = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5 note

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error("Audio API error:", e);
    }
  };

  if (!targetTime) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 p-3 rounded-2xl shadow-2xl backdrop-blur-xl transition-all duration-500 transform ${
      isFinished 
        ? 'bg-emerald-950/90 border-2 border-emerald-500/80 shadow-[0_0_30px_rgba(16,185,129,0.4)] animate-pulse' 
        : 'bg-slate-900/90 border border-slate-700/80'
    }`}>
      
      <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${isFinished ? 'border-emerald-400 bg-emerald-500/20' : 'border-cyan-500 bg-slate-800'}`}>
        <Timer className={`w-5 h-5 ${isFinished ? 'text-emerald-400' : 'text-cyan-400'}`} />
      </div>

      <div className="flex flex-col min-w-[80px]">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Отдых</span>
        <span className={`text-2xl font-black tabular-nums ${isFinished ? 'text-emerald-400' : 'text-slate-100'}`}>
          {formatTime(timeLeft)}
        </span>
      </div>

      <div className="flex flex-col gap-1 ml-2">
        <button 
          onClick={() => onAddTime(30)}
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center"
        >
          +30s
        </button>
        <button 
          onClick={() => onAddTime(-30)}
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center"
        >
          -30s
        </button>
      </div>

      <div className="w-px h-10 bg-slate-700 mx-1"></div>

      <button 
        onClick={onClose}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

    </div>
  );
};
