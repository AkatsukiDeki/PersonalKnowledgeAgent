import React, { useState, useEffect } from 'react';
import { subjectsApi, PracticeParams } from '../../api/subjects';
import { X, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import clsx from 'clsx';

interface NormalizedOption {
  text: string;
  is_correct: boolean;
}

interface NormalizedQuestion {
  id: string;
  question: string;
  options: NormalizedOption[];
  explanation: string;
}

interface QuizSessionModalProps {
  subjectId: string;
  topicId: string; // can be 'exam' or 'all' if global
  topicName: string;
  isExam?: boolean;
  practiceParams?: PracticeParams;
  onClose: () => void;
  onComplete: (score: number) => void;
}

export const QuizSessionModal: React.FC<QuizSessionModalProps> = ({
  subjectId,
  topicId,
  topicName,
  isExam = false,
  practiceParams,
  onClose,
  onComplete,
}) => {
  const [questions, setQuestions] = useState<NormalizedQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const [sessionFinished, setSessionFinished] = useState(false);
  const [failedConcepts, setFailedConcepts] = useState<string[]>([]);
  const [examErrors, setExamErrors] = useState<{q: string; chosen: string; correct: string}[]>([]);

  // 15 mins for exam, 30s per question for quiz
  const [timeLeft, setTimeLeft] = useState(isExam ? 15 * 60 : 30);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const fetcher = isExam 
      ? subjectsApi.generateExam(subjectId)
      : subjectsApi.generateQuiz(subjectId, practiceParams || {
          node_id: topicId === 'all' ? undefined : topicId,
          topic_title: topicName,
          difficulty: 'medium',
          count: 10,
        });

    fetcher
      .then((data) => {
        if (!isMounted) return;
        const rawQuestions = data.questions || [];

        const normalized: NormalizedQuestion[] = rawQuestions.map((q: any, idx: number) => {
          let options: NormalizedOption[] = [];

          if (Array.isArray(q.options)) {
            options = q.options.map((opt: any, optIdx: number) => {
              if (typeof opt === 'string') {
                return { text: opt, is_correct: optIdx === q.correct_answer };
              }
              return { text: opt.text || String(opt), is_correct: Boolean(opt.is_correct || optIdx === q.correct_answer) };
            });
          }

          return {
            id: q.id || `q_${idx}`,
            question: q.question || 'Вопрос без текста',
            options,
            explanation: q.explanation || 'Объяснение отсутствует.',
          };
        });

        setQuestions(normalized);
      })
      .catch((e) => {
        if (!isMounted) return;
        console.error('Failed to generate quiz:', e);
        setQuestions([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [subjectId, topicId, topicName, isExam, practiceParams]);

  const handleTimeUp = () => {
    if (isExam) {
      finishSession();
    } else {
      setSelectedOption(-1);
      setIsAnswerChecked(true);
      if (questions[currentIndex]) {
        setFailedConcepts((prev) => [...prev, questions[currentIndex].question]);
      }
    }
  };

  useEffect(() => {
    if (loading || sessionFinished || questions.length === 0) return;
    if (!isExam && isAnswerChecked) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, isAnswerChecked, sessionFinished, currentIndex, questions.length, isExam]);

  const handleSelectOption = (index: number) => {
    if (isAnswerChecked && !isExam) return;
    setSelectedOption(index);
    if (!isExam) {
      setIsAnswerChecked(true);
      const currentQ = questions[currentIndex];
      if (currentQ?.options[index]?.is_correct) {
        setCorrectCount((prev) => prev + 1);
      } else if (currentQ) {
        setFailedConcepts((prev) => [...prev, currentQ.question]);
      }
    }
  };

  const handleNext = () => {
    if (isExam && selectedOption !== null) {
       const currentQ = questions[currentIndex];
       if (currentQ.options[selectedOption]?.is_correct) {
         setCorrectCount((prev) => prev + 1);
       } else {
         setFailedConcepts((prev) => [...prev, currentQ.question]);
         setExamErrors(prev => [...prev, {
            q: currentQ.question,
            chosen: currentQ.options[selectedOption].text,
            correct: currentQ.options.find(o => o.is_correct)?.text || ''
         }]);
       }
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      if (!isExam) {
        setIsAnswerChecked(false);
        setTimeLeft(30);
      }
    } else {
      finishSession();
    }
  };

  const finishSession = async () => {
    const score = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
    setSessionFinished(true);

    try {
      await subjectsApi.recordSession({
        subject_id: subjectId,
        session_type: isExam ? 'exam' : 'quiz',
        topic_name: isExam ? 'Global Exam' : (topicName || topicId),
        score: score,
        failed_concepts: failedConcepts,
      });
      onComplete(score);
    } catch (e) {
      console.error('Failed to record session:', e);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center max-w-sm w-full mx-4">
          <RefreshCw className="animate-spin text-indigo-500 mb-4" size={32} />
          <h3 className="text-white font-bold text-lg mb-2">{isExam ? 'Подготовка экзамена' : 'Генерация теста'}</h3>
          <p className="text-zinc-400 text-sm text-center">
            {isExam ? 'Анализируем все материалы предмета...' : `Составляем вопросы по "${topicName}"...`}
          </p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center max-w-sm w-full mx-4">
          <AlertCircle className="text-red-500 mb-4" size={32} />
          <h3 className="text-white font-bold text-lg mb-2">Ошибка</h3>
          <button onClick={onClose} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-medium">
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  if (sessionFinished) {
    const score = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-lg w-full text-center">
          <CheckCircle2 className={score >= (isExam ? 85 : 70) ? "text-green-500 mb-4 mx-auto" : "text-orange-500 mb-4 mx-auto"} size={48} />
          <h3 className="text-white font-bold text-xl mb-2">{isExam ? 'Экзамен завершен!' : 'Тест завершен!'}</h3>
          <div className={`text-5xl font-black mb-6 ${score >= (isExam ? 85 : 70) ? 'text-green-400' : 'text-orange-400'}`}>{score}%</div>
          <p className="text-zinc-400 text-sm mb-6">Правильных ответов: {correctCount} из {questions.length}</p>
          
          {isExam && examErrors.length > 0 && (
            <div className="text-left mb-6 bg-red-500/10 border border-red-500/20 p-4 rounded-xl max-h-64 overflow-y-auto">
              <h4 className="text-red-400 font-bold mb-3 text-sm">Ошибки (Требуют повторения):</h4>
              <ul className="space-y-4">
                {examErrors.map((err, idx) => (
                  <li key={idx} className="text-sm">
                    <p className="text-white font-medium mb-1">{err.q}</p>
                    <p className="text-red-300">❌ {err.chosen}</p>
                    <p className="text-green-400">✅ {err.correct}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={onClose} className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors">
            {isExam && score >= 85 ? 'Получить Mastered 🏆' : 'Продолжить'}
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="absolute top-6 right-6">
        <button onClick={onClose} className="p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 w-full max-w-2xl mx-4 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {isExam ? <span className="text-indigo-400">🎓 Экзамен</span> : topicName}
            </h2>
            <p className="text-zinc-400 text-sm mt-1">Вопрос {currentIndex + 1} из {questions.length}</p>
          </div>
          <div className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm', timeLeft <= (isExam ? 60 : 5) ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-300')}>
            <Clock size={16} />
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Question */}
        <h3 className="text-lg font-medium text-white mb-6 leading-relaxed">{currentQ.question}</h3>

        {/* Options */}
        <div className="flex flex-col gap-3 mb-6">
          {currentQ.options.map((option, idx) => {
            const isSelected = selectedOption === idx;
            const isCorrect = option.is_correct;

            let btnClass = 'text-left px-5 py-4 rounded-xl border transition-all text-sm ';

            if (isExam) {
               btnClass += isSelected 
                 ? 'bg-indigo-500/20 border-indigo-500 text-indigo-100' 
                 : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800 text-zinc-200';
            } else {
              if (!isAnswerChecked) {
                btnClass += 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800 hover:border-indigo-500 text-zinc-200';
              } else {
                if (isCorrect) btnClass += 'bg-green-500/20 border-green-500 text-green-100 font-medium';
                else if (isSelected) btnClass += 'bg-red-500/20 border-red-500 text-red-100 font-medium';
                else btnClass += 'bg-zinc-800/50 border-zinc-800/50 text-zinc-500 opacity-40';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(idx)}
                disabled={!isExam && isAnswerChecked}
                className={btnClass}
              >
                {option.text}
              </button>
            );
          })}
        </div>

        {/* Action button */}
        {(isExam ? selectedOption !== null : isAnswerChecked) && (
          <div className="mt-4">
            {!isExam && (
              <div className="mb-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <h4 className="text-indigo-400 font-bold text-sm mb-2">Разбор</h4>
                <p className="text-zinc-300 text-sm leading-relaxed">{currentQ.explanation}</p>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors text-sm"
              >
                {currentIndex < questions.length - 1 ? 'Следующий вопрос' : 'Завершить'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};