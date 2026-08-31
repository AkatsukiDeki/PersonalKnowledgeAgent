import { useState } from 'react';

export function useQuizGenerator() {
  const [quiz, setQuiz] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQuiz = async (payload: {
    scope: any;
    module_id?: string;
    topic_id?: string;
    difficulty?: "beginner" | "intermediate" | "advanced";
    question_count?: number;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1') + '/learning/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Не удалось сгенерировать тест');
      const data = await res.json();
      setQuiz(data);
    } catch (err: any) {
      setError(err.message || 'Ошибка генерации');
    } finally {
      setIsLoading(false);
    }
  };

  const resetQuiz = () => setQuiz(null);

  return { quiz, isLoading, error, generateQuiz, resetQuiz };
}
