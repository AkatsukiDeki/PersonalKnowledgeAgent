import { useState, useCallback } from 'react';
import { sourcesApi } from '../api/sources';

export function useSourceTranslation() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const startTranslation = useCallback(async (sourceId: string, targetLang: string = 'ru') => {
    setIsTranslating(true);
    setTranslatedText('');
    setError(null);

    try {
      let fullText = '';
      await sourcesApi.translateSource(sourceId, targetLang, (chunk) => {
        fullText += chunk;
        setTranslatedText(fullText);
      });
    } catch (err: any) {
      console.error('Translation error:', err);
      setError(err.message || 'Failed to translate source');
    } finally {
      setIsTranslating(false);
    }
  }, []);

  return {
    isTranslating,
    translatedText,
    error,
    startTranslation,
    setTranslatedText,
  };
}
