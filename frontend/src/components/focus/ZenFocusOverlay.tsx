import React, { useState, useEffect } from 'react';
import { useFocus } from '../../context/FocusContext';
import { Minimize2, Play, Square, Check, Coffee, BookOpen } from 'lucide-react';
import { getFocusContext, FocusContextResponse } from '../../api/tasks';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';

export function ZenFocusOverlay() {
  const {
    isZenOpen,
    activeTaskId,
    activeTaskTitle,
    sessionState,
    sessionType,
    timeLeft,
    closeZenMode,
    startSession,
    stopSession,
    submitFinish
  } = useFocus();

  const [contextData, setContextData] = useState<FocusContextResponse | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isZenOpen && activeTaskId) {
      loadContext(activeTaskId);
    }
  }, [isZenOpen, activeTaskId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isZenOpen) {
        closeZenMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZenOpen, closeZenMode]);

  const loadContext = async (taskId: string) => {
    try {
      setLoadingContext(true);
      const data = await getFocusContext(taskId);
      setContextData(data);
    } catch (e) {
      console.error('Failed to load focus context', e);
      // Fallback
      setContextData({
        task_title: activeTaskTitle || 'Task',
        topic_name: null,
        context_snippets: []
      });
    } finally {
      setLoadingContext(false);
    }
  };

  if (!isZenOpen) return null;

  const durationSec = (sessionType === 'focus' ? 25 : sessionType === 'short_break' ? 5 : 15) * 60;
  const progress = sessionState === 'running' ? ((durationSec - timeLeft) / durationSec) * 100 : 0;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
      
      <button 
        onClick={closeZenMode}
        className="absolute top-6 right-6 p-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
        title="Minimize (Esc)"
      >
        <Minimize2 size={24} />
      </button>

      <div className="w-full max-w-6xl h-full max-h-[800px] flex gap-6">
        
        {/* Left Panel: Context */}
        <div className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 flex flex-col overflow-hidden">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
              <BookOpen className="text-indigo-400" />
              {contextData?.task_title || activeTaskTitle || 'Focus Session'}
            </h2>
            {contextData?.topic_name && (
              <span className="inline-block mt-2 text-xs font-medium text-zinc-400 uppercase tracking-wider bg-zinc-800 px-2 py-1 rounded">
                Topic: {contextData.topic_name}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-4 space-y-6 custom-scrollbar">
            {loadingContext ? (
              <div className="flex items-center justify-center h-full text-zinc-500 animate-pulse">
                Loading working context...
              </div>
            ) : contextData?.context_snippets.length ? (
              contextData.context_snippets.map((snippet, idx) => (
                <div key={idx} className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-5 text-sm text-zinc-300 leading-relaxed prose prose-invert max-w-none">
                  <ReactMarkdown>{snippet}</ReactMarkdown>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center px-10">
                <BookOpen size={48} className="mb-4 text-zinc-700" />
                <p>Материалы по теме ещё не добавлены в базу знаний.</p>
                <p className="text-sm mt-2">Вы можете сосредоточиться на выполнении задачи без дополнительных конспектов.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Timer & Controls */}
        <div className="w-96 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 flex flex-col relative overflow-hidden">
          
          <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
            {sessionState === 'running' && (
              <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${progress}%` }} />
            )}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
            
            <div className="text-center mb-10">
              <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-zinc-500 block mb-4">
                {sessionType.replace('_', ' ')}
              </span>
              <div className={clsx("text-7xl font-mono font-light tracking-tight", sessionState === 'running' ? 'text-red-400' : 'text-zinc-300')}>
                {formatTime(timeLeft)}
              </div>
            </div>

            {sessionState === 'idle' ? (
              <div className="flex gap-4">
                <button 
                  onClick={() => startSession('focus')}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors font-medium"
                >
                  <Play size={18} /> Start Focus
                </button>
                <button 
                  onClick={() => startSession('short_break')}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-colors font-medium"
                >
                  <Coffee size={18} /> Break
                </button>
              </div>
            ) : sessionState === 'running' ? (
              <button 
                onClick={stopSession}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors font-medium"
              >
                <Square size={18} /> Stop Session
              </button>
            ) : (
              <div className="w-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
                <textarea 
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="What did you accomplish?"
                  className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-200 resize-none focus:outline-none focus:border-indigo-500"
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => { submitFinish(true, notes); setNotes(''); }} 
                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl transition-colors"
                  >
                    Interrupted
                  </button>
                  <button 
                    onClick={() => { submitFinish(false, notes); setNotes(''); }} 
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors flex justify-center items-center gap-2"
                  >
                    <Check size={18}/> Save & Complete
                  </button>
                </div>
              </div>
            )}
            
          </div>
        </div>

      </div>
    </div>
  );
}
