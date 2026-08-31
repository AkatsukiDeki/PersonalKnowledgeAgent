import React, { useState } from 'react';

interface QuizOption {
  id: string;
  text: string;
  is_correct?: boolean; // Присутствует в ответе сервера после грейдинга или изначально
}

interface QuizQuestion {
  id: string;
  question_type: "single_choice" | "multiple_choice" | "code_fix";
  prompt: string;
  code_snippet?: string;
  options: QuizOption[];
  explanation: string;
  evidence_claim_ids: string[];
}

interface QuizPayload {
  title: string;
  description: string;
  questions: QuizQuestion[];
}

interface QuizGradeResult {
  score_percentage: number;
  correct_count: number;
  total_count: number;
  feedback: Record<string, string>;
}

interface QuizViewProps {
  quiz: QuizPayload;
  onClose: () => void;
}

export const QuizView: React.FC<QuizViewProps> = ({ quiz, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string[]>>({});
  const [gradeResult, setGradeResult] = useState<QuizGradeResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestion = quiz.questions[currentIndex];

  const handleOptionToggle = (questionId: string, optionId: string, type: string) => {
    setUserAnswers((prev) => {
      const current = prev[questionId] || [];
      if (type === "single_choice") {
        return { ...prev, [questionId]: [optionId] };
      } else {
        // multiple_choice
        if (current.includes(optionId)) {
          return { ...prev, [questionId]: current.filter((id) => id !== optionId) };
        } else {
          return { ...prev, [questionId]: [...current, optionId] };
        }
      }
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch((import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1') + '/learning/quiz/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz,
          user_answers: userAnswers,
        }),
      });
      if (!response.ok) throw new Error("Failed to grade quiz");
      const result: QuizGradeResult = await response.json();
      setGradeResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (gradeResult) {
    return (
      <div className="p-6 max-w-2xl mx-auto bg-slate-900 text-slate-100 rounded-xl shadow-xl">
        <h2 className="text-2xl font-bold mb-4">Результаты квиза</h2>
        <div className="text-3xl font-extrabold mb-6 text-emerald-400">
          {gradeResult.score_percentage.toFixed(0)}% ({gradeResult.correct_count} из {gradeResult.total_count} верно)
        </div>

        <div className="space-y-4 mb-6">
          {quiz.questions.map((q, idx) => (
            <div key={q.id} className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <p className="font-semibold mb-2">
                {idx + 1}. {q.prompt}
              </p>
              <p className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded">
                {gradeResult.feedback[q.id]}
              </p>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors"
        >
          Закрыть квиз
        </button>
      </div>
    );
  }

  const selectedOptions = userAnswers[currentQuestion.id] || [];

  return (
    <div className="p-6 max-w-2xl mx-auto bg-slate-900 text-slate-100 rounded-xl shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">{quiz.title}</h2>
        <span className="text-sm text-slate-400">
          Вопрос {currentIndex + 1} из {quiz.questions.length}
        </span>
      </div>

      <div className="mb-6">
        <p className="text-lg font-medium mb-4">{currentQuestion.prompt}</p>
        
        {currentQuestion.code_snippet && (
          <pre className="p-4 bg-slate-950 text-emerald-300 rounded-lg text-sm font-mono overflow-x-auto mb-4 border border-slate-800">
            {currentQuestion.code_snippet}
          </pre>
        )}

        <div className="space-y-3">
          {currentQuestion.options.map((opt) => {
            const isSelected = selectedOptions.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => handleOptionToggle(currentQuestion.id, opt.id, currentQuestion.question_type)}
                className={`w-full text-left p-4 rounded-lg border transition-all flex items-center justify-between ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200'
                    : 'border-slate-800 bg-slate-800/50 hover:bg-slate-800 text-slate-200'
                }`}
              >
                <span>{opt.text}</span>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  isSelected ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
                }`}>
                  {isSelected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-slate-800">
        <button
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((prev) => prev - 1)}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
        >
          Назад
        </button>

        {currentIndex < quiz.questions.length - 1 ? (
          <button
            onClick={() => setCurrentIndex((prev) => prev + 1)}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
          >
            Далее
          </button>
        ) : (
          <button
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {isSubmitting ? 'Проверка...' : 'Завершить и сдать'}
          </button>
        )}
      </div>
    </div>
  );
};
