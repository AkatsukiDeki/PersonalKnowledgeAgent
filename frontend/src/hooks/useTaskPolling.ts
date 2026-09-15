import { useState, useEffect, useRef } from 'react';
import { sourcesApi } from '../api/sources';

interface UseTaskPollingOptions {
  taskId: string | null;
  intervalMs?: number;
  onProgress?: (progress: number, step: string) => void;
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
}

export function useTaskPolling({
  taskId,
  intervalMs = 1500,
  onProgress,
  onSuccess,
  onError,
}: UseTaskPollingOptions) {
  const [status, setStatus] = useState<string>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [step, setStep] = useState<string>('');
  
  // Use refs for callbacks to avoid re-triggering useEffect
  const onProgressRef = useRef(onProgress);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onProgressRef.current = onProgress;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onProgress, onSuccess, onError]);

  useEffect(() => {
    if (!taskId) {
      setStatus('idle');
      setProgress(0);
      setStep('');
      return;
    }

    let intervalId: ReturnType<typeof setInterval>;
    let isPolling = true;

    const poll = async () => {
      try {
        const data = await sourcesApi.getTaskStatus(taskId);
        
        if (!isPolling) return;

        setStatus(data.status);
        
        if (data.progress !== undefined) {
          setProgress(data.progress);
        }
        
        if (data.step) {
          setStep(data.step);
          if (onProgressRef.current) {
            onProgressRef.current(data.progress || 0, data.step);
          }
        }

        if (data.status === 'completed') {
          isPolling = false;
          clearInterval(intervalId);
          if (onSuccessRef.current) {
            onSuccessRef.current(data.result);
          }
        } else if (data.status === 'failed') {
          isPolling = false;
          clearInterval(intervalId);
          if (onErrorRef.current) {
            onErrorRef.current(data.error || 'Task failed');
          }
        }
      } catch (err: any) {
        if (!isPolling) return;
        isPolling = false;
        clearInterval(intervalId);
        if (onErrorRef.current) {
          onErrorRef.current(err.message || 'Error polling task status');
        }
      }
    };

    // Initial immediate poll
    poll();
    
    // Setup interval
    intervalId = setInterval(poll, intervalMs);

    return () => {
      isPolling = false;
      clearInterval(intervalId);
    };
  }, [taskId, intervalMs]);

  return { status, progress, step };
}
