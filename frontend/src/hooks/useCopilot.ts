import { useState, useRef, useCallback, useEffect } from 'react';

interface UseCopilotOptions {
  debounceMs?: number;
  lastAssistantMessage?: string;
}

export function useCopilot({ debounceMs = 350, lastAssistantMessage }: UseCopilotOptions = {}) {
  const [suggestion, setSuggestion] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  const fetchSuggestion = useCallback(
    async (prefix: string) => {
      if (!prefix || prefix.trim().length < 3) {
        setSuggestion('');
        return;
      }

      if (cacheRef.current.has(prefix)) {
        setSuggestion(cacheRef.current.get(prefix) || '');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const res = await fetch('/api/v1/copilot/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prefix,
            last_assistant_message: lastAssistantMessage,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) return;
        const data = await res.json();
        const text = data.suggestion || '';
        
        cacheRef.current.set(prefix, text);
        setSuggestion(text);
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          setSuggestion('');
        }
      }
    },
    [lastAssistantMessage]
  );

  const handleInputChange = useCallback(
    (text: string) => {
      setSuggestion('');

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = window.setTimeout(() => {
        fetchSuggestion(text);
      }, debounceMs);
    },
    [debounceMs, fetchSuggestion]
  );

  const dismissSuggestion = useCallback(() => {
    setSuggestion('');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const acceptSuggestion = useCallback(
    (currentText: string) => {
      if (!suggestion) return currentText;
      const combined = currentText + suggestion;
      setSuggestion('');
      return combined;
    },
    [suggestion]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  return {
    suggestion,
    handleInputChange,
    acceptSuggestion,
    dismissSuggestion,
  };
}
