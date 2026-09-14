import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { focusApi } from '../api/focus';

interface FocusState {
  isZenOpen: boolean;
  activeTaskId: string | null;
  activeTaskTitle: string | null;
  requestedDuration: number | null;
  
  sessionState: 'idle' | 'running' | 'finishing';
  sessionType: 'focus' | 'short_break' | 'long_break';
  timeLeft: number;
  sessionId: string | null;
  
  startFocusWithTask: (taskId: string, taskTitle: string, durationMinutes?: number) => void;
  startSession: (type: 'focus' | 'short_break' | 'long_break', durationOverride?: number) => Promise<void>;
  stopSession: () => void;
  completeSession: () => void;
  submitFinish: (interrupted: boolean, notes?: string) => Promise<void>;
  
  openZenMode: () => void;
  closeZenMode: () => void;
  clearFocusTask: () => void;
}

const FocusContext = createContext<FocusState | undefined>(undefined);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [isZenOpen, setIsZenOpen] = useState(false);
  
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTaskTitle, setActiveTaskTitle] = useState<string | null>(null);
  const [requestedDuration, setRequestedDuration] = useState<number | null>(null);

  const [sessionState, setSessionState] = useState<'idle' | 'running' | 'finishing'>('idle');
  const [sessionType, setSessionType] = useState<'focus' | 'short_break' | 'long_break'>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const durationRef = useRef(25 * 60);

  useEffect(() => {
    if (sessionState === 'running') {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setSessionState('finishing');
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

  const openZenMode = () => setIsZenOpen(true);
  const closeZenMode = () => setIsZenOpen(false);

  const startSession = async (type: 'focus' | 'short_break' | 'long_break', durationOverride?: number) => {
    const duration = durationOverride || (type === 'focus' ? 25 : type === 'short_break' ? 5 : 15);
    try {
      const res = await focusApi.startSession({
        session_type: type,
        target_duration_min: duration,
        task_id: activeTaskId || undefined,
        task_name: activeTaskTitle || undefined
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

  const startFocusWithTask = (taskId: string, taskTitle: string, durationMinutes?: number) => {
    setActiveTaskId(taskId);
    setActiveTaskTitle(taskTitle);
    setRequestedDuration(durationMinutes || 25);
    setIsZenOpen(true);
  };

  // Automatically start the session when a task is set
  useEffect(() => {
    if (activeTaskId && sessionState === 'idle') {
      startSession('focus', requestedDuration || 25);
    }
  }, [activeTaskId, sessionState]);

  const completeSession = () => {
    setSessionState('finishing');
  };

  const stopSession = () => {
    setSessionState('finishing');
  };

  const submitFinish = async (interrupted: boolean, notes: string = '') => {
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
      setSessionState('idle');
      setSessionId(null);
      setTimeLeft(25 * 60);
      clearFocusTask();
      setIsZenOpen(false); // Close zen mode on finish
    }
  };

  const clearFocusTask = () => {
    setActiveTaskId(null);
    setActiveTaskTitle(null);
    setRequestedDuration(null);
  };

  return (
    <FocusContext.Provider
      value={{
        isZenOpen,
        activeTaskId,
        activeTaskTitle,
        requestedDuration,
        sessionState,
        sessionType,
        timeLeft,
        sessionId,
        
        startFocusWithTask,
        startSession,
        stopSession,
        completeSession,
        submitFinish,
        openZenMode,
        closeZenMode,
        clearFocusTask,
      }}
    >
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus() {
  const context = useContext(FocusContext);
  if (context === undefined) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
}
