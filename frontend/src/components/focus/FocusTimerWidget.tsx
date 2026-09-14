import React, { useState } from 'react';
import { Play, Square, Coffee, Check, X, Tag } from 'lucide-react';
import clsx from 'clsx';
import { useFocus } from '../../context/FocusContext';

export function FocusTimerWidget() {
  const { 
    activeTaskTitle, 
    sessionState, 
    sessionType, 
    timeLeft, 
    startSession, 
    stopSession, 
    submitFinish,
    openZenMode
  } = useFocus();

  const [notes, setNotes] = useState('');
  
  // Calculate total duration for progress bar based on session type
  const durationSec = (sessionType === 'focus' ? 25 : sessionType === 'short_break' ? 5 : 15) * 60;
  const progress = sessionState === 'running' ? ((durationSec - timeLeft) / durationSec) * 100 : 0;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isFinishing = sessionState === 'finishing';

  return (
    <div className="relative group flex items-center shrink-0">
      
      {sessionState === 'idle' && (
        <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/5">
          <button onClick={() => startSession('focus')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <Play size={12} className="text-red-400" /> Focus
          </button>
          <button onClick={() => startSession('short_break')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="Short Break">
            <Coffee size={12} className="text-emerald-400" />
          </button>
        </div>
      )}

      {sessionState === 'running' && (
        <div 
          onClick={openZenMode}
          className="flex items-center gap-3 bg-red-950/30 border border-red-900/30 pl-3 pr-1 py-1 rounded-xl relative overflow-hidden cursor-pointer hover:bg-red-950/40 transition-colors"
          title="Open Zen Mode"
        >
          <div className="absolute bottom-0 left-0 h-0.5 bg-red-500/50 transition-all duration-1000" style={{ width: `${progress}%` }} />
          
          <div className="flex flex-col">
            <span className={clsx("text-sm font-mono font-medium leading-none tracking-wider", sessionType === 'focus' ? 'text-red-400' : 'text-emerald-400')}>
              {formatTime(timeLeft)}
            </span>
            <span className="text-[9px] uppercase text-white/30 font-semibold tracking-widest mt-0.5 truncate max-w-[120px]">
              {activeTaskTitle ? `Task: ${activeTaskTitle}` : sessionType.replace('_', ' ')}
            </span>
          </div>

          <button onClick={(e) => { e.stopPropagation(); stopSession(); }} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors z-10">
            <Square size={14} />
          </button>
        </div>
      )}

      {isFinishing && (
        <div className="absolute top-14 right-0 w-80 bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 shadow-2xl z-50">
          <h4 className="text-sm font-medium text-zinc-200 mb-2">Session Complete</h4>
          <p className="text-xs text-zinc-400 mb-4">You spent {Math.floor((durationSec - timeLeft)/60)}m focusing.</p>
          
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
            <button onClick={() => { submitFinish(true, notes); setNotes(''); }} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors">
              Interrupted
            </button>
            <button onClick={() => { submitFinish(false, notes); setNotes(''); }} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex justify-center items-center gap-1.5">
              <Check size={14}/> Save
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
