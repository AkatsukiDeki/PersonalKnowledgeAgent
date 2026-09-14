import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api/client';
import WebApp from '@twa-dev/sdk';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

export function TmaHybridQuiz({ folder, mode, onBack }: { folder: string | null, mode: 'flashcards' | 'quiz', onBack: () => void }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  // Flashcard state
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    // Generate quiz
    const payload = {
      scope: folder ? { folder, recursive: true } : {},
      question_count: 10,
      difficulty: 'intermediate'
    };

    const endpoint = mode === 'flashcards' ? 'learning/flashcards' : 'learning/quiz';
    
    fetchApi<any>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
      .then(res => {
        let qs: any[] = [];
        if (mode === 'quiz' && Array.isArray(res?.questions) && res.questions.length > 0) {
          qs = res.questions.map((q: any) => ({ ...q, type: 'quiz' }));
        } else if (mode === 'flashcards' && Array.isArray(res?.cards) && res.cards.length > 0) {
          qs = res.cards.map((c: any) => ({
            ...c,
            type: 'flashcard',
            prompt: c.question,
            options: [{ text: c.answer, is_correct: true }],
            explanation: ''
          }));
        }

        if (qs.length > 0) {
          setQuestions(qs);
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
  }, [folder, mode, onBack]);

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsFlipped(false);
    } else {
      setFinished(true);
    }
  };

  const handleSelectOption = (idx: number, isCorrect: boolean) => {
    if (selectedOption !== null) return;
    
    setSelectedOption(idx);
    
    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
      WebApp.HapticFeedback.notificationOccurred('success');
    } else {
      const q = questions[currentIndex];
      setMistakes(prev => [...prev, q]);
      WebApp.HapticFeedback.notificationOccurred('warning');
    }
    
    setTimeout(nextQuestion, 1500);
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    if (direction === 'right') {
      setCorrectCount(prev => prev + 1);
      WebApp.HapticFeedback.notificationOccurred('success');
    } else {
      const q = questions[currentIndex];
      setMistakes(prev => [...prev, q]);
      WebApp.HapticFeedback.notificationOccurred('warning');
    }
    setTimeout(nextQuestion, 300);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center space-y-4 bg-[var(--tg-theme-secondary-bg-color)]">
        <div className="animate-spin h-10 w-10 border-4 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full" />
        <p className="text-[var(--tg-theme-hint-color)]">Генерация спринта...</p>
      </div>
    );
  }

  if (finished) {
    const pct = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6 bg-[var(--tg-theme-secondary-bg-color)]">
        <div className="text-center mt-8">
          <h1 className="text-3xl font-bold text-[var(--tg-theme-text-color)]">Тренировка завершена!</h1>
          <div className="mt-4 inline-block px-6 py-3 bg-[var(--tg-theme-bg-color)] rounded-2xl border border-[var(--tg-theme-hint-color)] border-opacity-20">
            <span className="text-2xl font-bold text-[var(--tg-theme-button-color)]">{correctCount} / {questions.length}</span>
            <p className="text-[var(--tg-theme-hint-color)] mt-1">{pct}% правильных</p>
          </div>
        </div>

        {mistakes.length > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="text-xl font-bold text-[var(--tg-theme-text-color)]">Разбор ошибок</h2>
            {mistakes.map((m, i) => (
              <div key={i} className="p-4 bg-[var(--tg-theme-bg-color)] rounded-2xl border border-[var(--tg-theme-hint-color)] border-opacity-20">
                <p className="font-semibold text-[var(--tg-theme-text-color)] mb-2">{m.prompt}</p>
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl mb-3">
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
          className="w-full mt-4 p-4 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-2xl font-semibold active:opacity-80 transition-opacity shadow-lg"
        >
          Вернуться на главную
        </button>
      </div>
    );
  }

  const q = questions[currentIndex];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--tg-theme-secondary-bg-color)] relative">
      <div className="px-6 py-4 flex items-center justify-between z-10 sticky top-0 bg-[var(--tg-theme-secondary-bg-color)] shadow-sm">
        <button onClick={onBack} className="text-[var(--tg-theme-button-color)] font-medium">Назад</button>
        <span className="text-sm font-semibold text-[var(--tg-theme-hint-color)]">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <div className="flex-1 px-4 pb-6 flex flex-col relative overflow-hidden justify-center items-center">
        <AnimatePresence mode="wait">
          {q.type === 'flashcard' ? (
             <motion.div
              key={`flashcard-${currentIndex}`}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.8}
              onDragEnd={(e, { offset, velocity }) => {
                const swipe = offset.x;
                if (swipe > 100) handleSwipe('right');
                else if (swipe < -100) handleSwipe('left');
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotateY: isFlipped ? 180 : 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              onClick={() => setIsFlipped(!isFlipped)}
              className="w-full max-w-sm aspect-[3/4] bg-[var(--tg-theme-bg-color)] rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer border border-[var(--tg-theme-hint-color)] border-opacity-20 absolute"
              style={{ transformStyle: 'preserve-3d' }}
             >
               <div className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-8" style={{ backfaceVisibility: 'hidden' }}>
                 <p className="text-sm text-[var(--tg-theme-hint-color)] uppercase tracking-widest mb-6">Термин</p>
                 <h2 className="text-2xl font-bold text-[var(--tg-theme-text-color)]">{q.prompt}</h2>
                 <p className="text-[var(--tg-theme-hint-color)] mt-8 opacity-60">Нажми, чтобы перевернуть</p>
               </div>
               
               <div className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-8 bg-[var(--tg-theme-secondary-bg-color)] rounded-3xl" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                 <p className="text-sm text-[var(--tg-theme-button-color)] uppercase tracking-widest mb-4">Определение</p>
                 <p className="text-lg font-medium text-[var(--tg-theme-text-color)] mb-6">
                    {q.options.find((o: any) => o.is_correct)?.text}
                 </p>
                 <p className="text-sm text-[var(--tg-theme-hint-color)] italic">{q.explanation}</p>
                 <div className="flex gap-4 w-full mt-auto pt-8">
                   <button 
                     onClick={(e) => { e.stopPropagation(); handleSwipe('left'); }}
                     className="flex-1 py-3 bg-red-500/10 text-red-500 rounded-xl text-sm font-bold text-center active:scale-95 transition-transform"
                   >
                     👈 Повторить
                   </button>
                   <button 
                     onClick={(e) => { e.stopPropagation(); handleSwipe('right'); }}
                     className="flex-1 py-3 bg-green-500/10 text-green-500 rounded-xl text-sm font-bold text-center active:scale-95 transition-transform"
                   >
                     Знаю 👉
                   </button>
                 </div>
               </div>
             </motion.div>
          ) : (
             <motion.div
              key={`quiz-${currentIndex}`}
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full flex flex-col pb-safe"
             >
               <div className="flex-1 flex flex-col justify-center mb-8 px-2">
                 <h2 className="text-2xl font-bold text-[var(--tg-theme-text-color)] text-center leading-tight">
                   {q.prompt}
                 </h2>
               </div>
               
               <div className="space-y-3 mt-auto">
                {q.options.map((opt: any, idx: number) => {
                  let btnStyle = "bg-[var(--tg-theme-bg-color)] border border-[var(--tg-theme-hint-color)] border-opacity-20 text-[var(--tg-theme-text-color)]";
                  if (selectedOption !== null) {
                    if (opt.is_correct) {
                      btnStyle = "bg-green-500/10 border-green-500 text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]";
                    } else if (selectedOption === idx) {
                      btnStyle = "bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]";
                    }
                  }
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(idx, opt.is_correct)}
                      disabled={selectedOption !== null}
                      className={`w-full text-left p-5 rounded-2xl transition-all font-medium flex gap-4 items-center shadow-sm active:scale-[0.98] ${btnStyle}`}
                    >
                      <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border ${selectedOption !== null && (opt.is_correct || selectedOption === idx) ? 'border-current' : 'border-[var(--tg-theme-hint-color)] border-opacity-30'}`}>
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span className="flex-1">{opt.text}</span>
                    </button>
                  );
                })}
               </div>
             </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
