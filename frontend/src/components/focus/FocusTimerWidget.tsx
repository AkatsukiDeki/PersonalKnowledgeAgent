import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Coffee, Check, X, Tag } from 'lucide-react';
import { focusApi } from '../../api/focus';
import clsx from 'clsx';

export function FocusTimerWidget() {
  const [sessionState, setSessionState] = useState<'idle' | 'running' | 'finishing'>('idle');
  const [sessionType, setSessionType] = useState<'focus' | 'short_break' | 'long_break'>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const [isFinishing, setIsFinishing] = useState(false);
  const [notes, setNotes] = useState('');
  
  const timerRef = useRef<number | null>(null);
  const durationRef = useRef(25 * 60);

  useEffect(() => {
    if (sessionState === 'running') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionState]);

  const handleStart = async (type: 'focus' | 'short_break' | 'long_break') => {
    const duration = type === 'focus' ? 25 : type === 'short_break' ? 5 : 15;
    try {
      const res = await focusApi.startSession({
        session_type: type,
        target_duration_min: duration
      });
      setSessionId(res.session_id);
      setSessionType(type);
      setSessionState('running');
      durationRef.current = duration * 60;
      setTimeLeft(duration * 60);
    } catch (err) {
      console.error('Failed to start session', err);
    }
  };

  const handleComplete = () => {
    setSessionState('finishing');
    setIsFinishing(true);
    // Play sound if needed
  };

  const handleStop = () => {
    setSessionState('finishing');
    setIsFinishing(true);
  };

  const submitFinish = async (interrupted: boolean) => {
    if (!sessionId) return;
    try {
      await focusApi.finishSession({
        session_id: sessionId,
        actual_duration_sec: durationRef.current - timeLeft,
        completed: !interrupted,
        interrupted,
        session_notes: notes
      });
    } catch (err) {
      console.error('Failed to finish session', err);
    } finally {
      resetTimer();
    }
  };

  const resetTimer = () => {
    setSessionState('idle');
    setIsFinishing(false);
    setSessionId(null);
    setNotes('');
    setTimeLeft(25 * 60);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = sessionState === 'running' ? ((durationRef.current - timeLeft) / durationRef.current) * 100 : 0;

  return (
    <div className="relative group flex items-center shrink-0">
      
      {sessionState === 'idle' && (
        <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/5">
          <button onClick={() => handleStart('focus')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <Play size={12} className="text-red-400" /> Focus
          </button>
          <button onClick={() => handleStart('short_break')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="Short Break">
            <Coffee size={12} className="text-emerald-400" />
          </button>
        </div>
      )}

      {sessionState === 'running' && (
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-900/30 pl-3 pr-1 py-1 rounded-xl relative overflow-hidden">
          <div className="absolute bottom-0 left-0 h-0.5 bg-red-500/50 transition-all duration-1000" style={{ width: `${progress}%` }} />
          
          <div className="flex flex-col">
            <span className={clsx("text-sm font-mono font-medium leading-none tracking-wider", sessionType === 'focus' ? 'text-red-400' : 'text-emerald-400')}>
              {formatTime(timeLeft)}
            </span>
            <span className="text-[9px] uppercase text-white/30 font-semibold tracking-widest mt-0.5">
              {sessionType.replace('_', ' ')}
            </span>
          </div>

          <button onClick={handleStop} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors">
            <Square size={14} />
          </button>
        </div>
      )}

      {isFinishing && (
        <div className="absolute top-14 right-0 w-80 bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 shadow-2xl z-50">
          <h4 className="text-sm font-medium text-zinc-200 mb-2">Session Complete</h4>
          <p className="text-xs text-zinc-400 mb-4">You spent {Math.floor((durationRef.current - timeLeft)/60)}m focusing.</p>
          
          <div className="mb-4">
            <label className="text-xs text-zinc-500 mb-1 flex items-center gap-1.5"><Tag size={12}/> What did you accomplish? (optional)</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Implemented the API for..."
              className="w-full h-20 bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-200 resize-none focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => submitFinish(true)} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors">
              Interrupted
            </button>
            <button onClick={() => submitFinish(false)} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex justify-center items-center gap-1.5">
              <Check size={14}/> Save
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
