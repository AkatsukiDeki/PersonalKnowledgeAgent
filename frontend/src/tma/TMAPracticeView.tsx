import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import WebApp from '@twa-dev/sdk';
import { motion, AnimatePresence } from 'framer-motion';

export function TMAPracticeView({ folder, onBack }: { folder: string | null, onBack: () => void }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  useEffect(() => {
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(onBack);
    
    // Generate quiz
    const payload = {
      scope: folder ? { folder, recursive: true } : {},
      question_count: 10,
      difficulty: 'intermediate'
    };

    fetchApi<any>('learning/quiz', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (res.questions && res.questions.length > 0) {
          setQuestions(res.questions);
        } else {
          WebApp.showAlert('Не удалось сгенерировать вопросы по этой папке.');
          onBack();
        }
      })
      .catch(err => {
        console.error(err);
        WebApp.showAlert('Ошибка генерации квиза.');
        onBack();
      })
      .finally(() => setLoading(false));

    return () => {
      WebApp.BackButton.offClick(onBack);
      WebApp.BackButton.hide();
    };
  }, [folder, onBack]);

  const handleSelectOption = (idx: number, isCorrect: boolean) => {
    if (selectedOption !== null) return;
    
    setSelectedOption(idx);
    
    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
      WebApp.HapticFeedback.notificationOccurred('success');
    } else {
      const q = questions[currentIndex];
      setMistakes(prev => [...prev, q]);
      WebApp.HapticFeedback.notificationOccurred('error');
    }
    
    // Wait to show correctness, then move next
    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setSelectedOption(null);
      } else {
        setFinished(true);
      }
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center space-y-4">
        <div className="animate-spin h-10 w-10 border-4 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full" />
        <p className="text-[var(--tg-theme-hint-color)]">Генерация спринта...</p>
      </div>
    );
  }

  if (finished) {
    const pct = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6">
        <div className="text-center mt-8">
          <h1 className="text-3xl font-bold text-[var(--tg-theme-text-color)]">Тренировка завершена!</h1>
          <div className="mt-4 inline-block px-6 py-3 bg-[var(--tg-theme-secondary-bg-color)] rounded-2xl">
            <span className="text-2xl font-bold text-[var(--tg-theme-button-color)]">{correctCount} / {questions.length}</span>
            <p className="text-[var(--tg-theme-hint-color)] mt-1">{pct}% правильных</p>
          </div>
        </div>

        {mistakes.length > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="text-xl font-bold text-[var(--tg-theme-text-color)]">Разбор ошибок</h2>
            {mistakes.map((m, i) => (
              <div key={i} className="p-4 bg-[var(--tg-theme-secondary-bg-color)] rounded-2xl">
                <p className="font-semibold text-[var(--tg-theme-text-color)] mb-2">{m.prompt}</p>
                <div className="p-3 bg-[var(--tg-theme-bg-color)] border border-green-500/30 rounded-xl mb-3">
                  <span className="text-green-500 font-medium">✅ Правильно: </span>
                  <span className="text-[var(--tg-theme-text-color)]">
                    {m.options.find((o: any) => o.is_correct)?.text}
                  </span>
                </div>
                <p className="text-sm text-[var(--tg-theme-hint-color)]">💡 {m.explanation}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onBack}
          className="w-full mt-4 p-4 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-xl font-semibold active:opacity-80 transition-opacity"
        >
          Вернуться на главную
        </button>
      </div>
    );
  }

  const q = questions[currentIndex];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--tg-theme-secondary-bg-color)]">
      {/* Header Progress */}
      <div className="px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--tg-theme-hint-color)]">
          Вопрос {currentIndex + 1} из {questions.length}
        </span>
        <div className="flex-1 ml-4 h-2 bg-[var(--tg-theme-bg-color)] rounded-full overflow-hidden">
          <div 
            className="h-full bg-[var(--tg-theme-button-color)] transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card Content */}
      <div className="flex-1 px-4 pb-6 flex flex-col relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentIndex}
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col bg-[var(--tg-theme-bg-color)] rounded-3xl p-6 shadow-sm overflow-y-auto"
          >
            <h2 className="text-xl md:text-2xl font-bold text-[var(--tg-theme-text-color)] mb-8">
              {q.prompt}
            </h2>
            
            <div className="mt-auto space-y-3">
              {q.options.map((opt: any, idx: number) => {
                let btnStyle = "bg-[var(--tg-theme-secondary-bg-color)] border border-transparent";
                if (selectedOption !== null) {
                  if (opt.is_correct) {
                    btnStyle = "bg-green-500/10 border-green-500 text-green-500";
                  } else if (selectedOption === idx) {
                    btnStyle = "bg-red-500/10 border-red-500 text-red-500";
                  }
                }
                
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx, opt.is_correct)}
                    disabled={selectedOption !== null}
                    className={`w-full text-left p-4 rounded-2xl transition-all font-medium text-[var(--tg-theme-text-color)] ${btnStyle}`}
                  >
                    {opt.text}
                  </button>
                );
              })}
            </div>
            
            {/* Explanation reveals after selection */}
            {selectedOption !== null && q.explanation && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 bg-[var(--tg-theme-secondary-bg-color)] rounded-2xl"
              >
                <p className="text-sm text-[var(--tg-theme-text-color)] font-medium">💡 Пояснение</p>
                <p className="text-sm text-[var(--tg-theme-hint-color)] mt-1">{q.explanation}</p>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
