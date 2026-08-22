import React, { useState } from 'react';
import { CheckCircle, XCircle, ArrowRight } from 'lucide-react';

export interface QuizOption {
  text: string;
  is_correct: boolean;
}

export interface QuizQuestion {
  id?: string;
  question: string;
  options: (string | QuizOption)[];
  correct_answer?: number;
  explanation?: string;
}

interface Props {
  questions: QuizQuestion[];
  onComplete: (score?: number) => void;
}

export function QuizEngine({ questions, onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);

  if (!questions || questions.length === 0) return null;

  const currentQ = questions[currentIndex];

  // Универсальная нормализация вариантов ответов
  const normalizedOptions: QuizOption[] = (currentQ.options || []).map((opt, idx) => {
    if (typeof opt === 'string') {
      return {
        text: opt,
        is_correct: currentQ.correct_answer !== undefined ? idx === currentQ.correct_answer : false,
      };
    }
    return {
      text: opt.text || String(opt),
      is_correct: Boolean(opt.is_correct || (currentQ.correct_answer !== undefined && idx === currentQ.correct_answer)),
    };
  });

  const handleSelect = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);

    if (normalizedOptions[idx]?.is_correct) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      onComplete(score + (normalizedOptions[selectedOption ?? -1]?.is_correct ? 0 : 0));
    }
  };

  const isLast = currentIndex === questions.length - 1;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-center h-full p-6">
      {/* Прогресс и счет */}
      <div className="w-full flex items-center justify-between mb-8 text-sm font-medium text-white/40">
        <span>
          Вопрос {currentIndex + 1} из {questions.length}
        </span>
        <span className="bg-white/5 px-3 py-1 rounded-full border border-white/10 text-white/80">
          Счет: {score}
        </span>
      </div>

      {/* Карточка вопроса */}
      <div className="w-full bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl mb-6">
        <h3 className="text-xl text-white/90 font-medium mb-8 leading-relaxed">
          {currentQ.question}
        </h3>

        <div className="space-y-3">
          {normalizedOptions.map((opt, idx) => {
            let btnClass =
              'w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between ';
            let icon = null;

            if (!isAnswered) {
              btnClass +=
                'border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-white/80 bg-white/5 cursor-pointer';
            } else {
              if (opt.is_correct) {
                btnClass += 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-medium';
                icon = <CheckCircle size={18} className="text-emerald-400 shrink-0" />;
              } else if (selectedOption === idx) {
                btnClass += 'border-red-500/50 bg-red-500/10 text-red-300 font-medium';
                icon = <XCircle size={18} className="text-red-400 shrink-0" />;
              } else {
                btnClass += 'border-white/5 bg-white/5 text-white/30 opacity-40';
              }
            }

            return (
              <button
                key={idx}
                disabled={isAnswered}
                onClick={() => handleSelect(idx)}
                className={btnClass}
              >
                <span className="pr-4 leading-relaxed">{opt.text}</span>
                {icon}
              </button>
            );
          })}
        </div>
      </div>

      {/* Разбор и кнопка перехода */}
      {isAnswered && (
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-4">
          {currentQ.explanation && (
            <div className="w-full bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5 text-indigo-100/90 text-sm leading-relaxed">
              <div className="font-semibold text-indigo-400 mb-1">Объяснение:</div>
              {currentQ.explanation}
            </div>
          )}

          <button
            onClick={handleNext}
            className="self-end px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/25 cursor-pointer text-sm"
          >
            {isLast ? 'Завершить' : 'Следующий вопрос'} <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}