import React, { useState, useEffect } from 'react';
import { subjectsApi, FlashcardItem } from '../../api/subjects';
import { X, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface FlashcardsSessionModalProps {
  subjectId: string;
  topicId: string;
  topicName: string;
  practiceParams?: import('../../api/subjects').PracticeParams;
  onClose: () => void;
  onComplete: (score: number) => void;
}

export const FlashcardsSessionModal: React.FC<FlashcardsSessionModalProps> = ({
  subjectId,
  topicId,
  topicName,
  practiceParams,
  onClose,
  onComplete,
}) => {
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [failedConcepts, setFailedConcepts] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    subjectsApi
      .generateFlashcards(subjectId, practiceParams || {
        node_id: topicId === 'all' ? undefined : topicId,
        topic_title: topicName,
        difficulty: 'medium',
        count: 10,
      })
      .then((data) => {
        if (!isMounted) return;
        // Поддерживаем как flashcards, так и fallback cards
        const receivedCards = data.flashcards || (data as any).cards || [];
        setCards(receivedCards);
      })
      .catch((e) => {
        if (!isMounted) return;
        console.error('Failed to load flashcards:', e);
        setCards([]);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [subjectId, topicId, topicName, practiceParams]);

  const handleNext = async (quality: number) => {
    let newCorrect = correctCount;
    const currentCard = cards[currentIndex];

    // Оценка 4-5 считается успешным вспоминанием
    if (quality >= 4) {
      newCorrect = correctCount + 1;
      setCorrectCount(newCorrect);
    } else if (currentCard && quality < 3) {
      const questionText = currentCard.front || (currentCard as any).question || '';
      setFailedConcepts((prev) => [...prev, questionText]);
    }

    if (currentCard.id) {
      try {
        await subjectsApi.reviewFlashcard(subjectId, currentCard.id, quality);
      } catch (e) {
        console.error('Failed to review flashcard:', e);
      }
    }

    if (currentIndex < cards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((prev) => prev + 1), 150);
    } else {
      finishSession(newCorrect);
    }
  };

  const finishSession = async (finalCorrectCount: number) => {
    const score = cards.length > 0 ? (finalCorrectCount / cards.length) * 100 : 0;
    setSessionFinished(true);

    try {
      await subjectsApi.recordSession({
        subject_id: subjectId,
        session_type: 'flashcard',
        topic_name: topicName || topicId,
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
          <h3 className="text-white font-bold text-lg mb-2">Генерация карточек</h3>
          <p className="text-zinc-400 text-sm text-center">
            Анализируем материалы темы "{topicName}"...
          </p>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center max-w-sm w-full mx-4">
          <AlertCircle className="text-red-500 mb-4" size={32} />
          <h3 className="text-white font-bold text-lg mb-2">Ошибка</h3>
          <p className="text-zinc-400 text-sm text-center mb-6">
            Не удалось сгенерировать карточки. Проверьте, есть ли факты по этой теме.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  if (sessionFinished) {
    const score = Math.round((correctCount / cards.length) * 100);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center max-w-sm w-full mx-4 text-center">
          <CheckCircle2 className="text-green-500 mb-4" size={48} />
          <h3 className="text-white font-bold text-xl mb-2">Колода завершена!</h3>
          <p className="text-zinc-400 text-sm mb-6">
            Вы вспомнили {correctCount} из {cards.length} карточек.
          </p>
          <div className="text-4xl font-black text-indigo-400 mb-8">{score}%</div>
          <button
            onClick={onClose}
            className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
          >
            Продолжить
          </button>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const question = currentCard.front || (currentCard as any).question || '';
  const answer = currentCard.back || (currentCard as any).answer || '';

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="absolute top-6 right-6">
        <button
          onClick={onClose}
          className="p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <div className="mb-8 text-center px-4">
        <h2 className="text-2xl font-bold text-white mb-2">{topicName}</h2>
        <p className="text-zinc-400 font-medium text-sm">
          Карточка {currentIndex + 1} из {cards.length}
        </p>
      </div>

      {/* 3D Flip Card */}
      <div
        className="relative w-full max-w-md aspect-[4/3] cursor-pointer group perspective-1000 px-4"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div
          className="w-full h-full duration-500 preserve-3d"
          style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front */}
          <div className="absolute w-full h-full backface-hidden bg-zinc-900 border border-zinc-700 rounded-2xl p-8 flex flex-col items-center justify-center shadow-2xl">
            <span className="absolute top-4 left-4 text-xs font-bold tracking-widest text-zinc-500 uppercase">
              Вопрос
            </span>
            <p className="text-white text-lg font-medium text-center">{question}</p>
            {currentCard.hint && (
              <p className="text-xs text-zinc-400 mt-3 italic bg-zinc-800/60 px-3 py-1 rounded-full">
                Подсказка: {currentCard.hint}
              </p>
            )}
            <span className="absolute bottom-4 text-xs text-zinc-500">
              Нажмите, чтобы перевернуть
            </span>
          </div>

          {/* Back */}
          <div
            className="absolute w-full h-full backface-hidden bg-indigo-950 border border-indigo-500/30 rounded-2xl p-8 flex flex-col items-center justify-center shadow-2xl"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <span className="absolute top-4 left-4 text-xs font-bold tracking-widest text-indigo-400 uppercase">
              Ответ
            </span>
            <p className="text-white text-lg text-center leading-relaxed">{answer}</p>
          </div>
        </div>
      </div>

      <div
        className={`grid grid-cols-6 gap-2 mt-8 transition-opacity duration-300 ${
          isFlipped ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {[
          { q: 0, label: 'Провал', color: 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20' },
          { q: 1, label: 'С трудом', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20' },
          { q: 2, label: 'Неуверенно', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20' },
          { q: 3, label: 'Нормально', color: 'bg-lime-500/10 text-lime-500 border-lime-500/20 hover:bg-lime-500/20' },
          { q: 4, label: 'Хорошо', color: 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20' },
          { q: 5, label: 'Идеально', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' },
        ].map((btn) => (
          <button
            key={btn.q}
            onClick={(e) => {
              e.stopPropagation();
              handleNext(btn.q);
            }}
            className={`px-2 py-3 rounded-xl border font-medium text-xs sm:text-sm transition-colors flex flex-col items-center justify-center gap-1 ${btn.color}`}
          >
            <span>{btn.q}</span>
            <span className="text-[10px] sm:text-[11px] opacity-80">{btn.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
      `}</style>
    </div>
  );
};