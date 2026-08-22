import React, { useState } from 'react';
import { RefreshCw, Check, X, ArrowRight, ArrowLeft, Lightbulb } from 'lucide-react';

export interface Flashcard {
  id?: string;
  front?: string;
  back?: string;
  question?: string;
  answer?: string;
  hint?: string;
}

interface Props {
  cards: Flashcard[];
  onComplete: () => void;
}

export function FlashcardsView({ cards, onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (!cards || cards.length === 0) return null;

  const currentCard = cards[currentIndex];
  const questionText = currentCard.front || currentCard.question || '';
  const answerText = currentCard.back || currentCard.answer || '';
  const hintText = currentCard.hint;

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-4 relative perspective-1000">
      {/* Прогресс */}
      <div className="mb-6 text-indigo-300 font-medium text-sm tracking-wide bg-indigo-950/40 border border-indigo-500/20 px-4 py-1.5 rounded-full">
        Карточка {currentIndex + 1} из {cards.length}
      </div>

      {/* 3D Карточка */}
      <div
        className="relative w-full max-w-lg aspect-[3/2] cursor-pointer group"
        onClick={() => setIsFlipped(!isFlipped)}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="absolute inset-0 w-full h-full transition-transform duration-500 ease-in-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Лицевая сторона (Вопрос) */}
          <div
            className="absolute inset-0 w-full h-full bg-[#111116] border border-white/10 group-hover:border-indigo-500/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-2xl transition-colors"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="absolute top-4 left-4 text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
              Вопрос
            </span>
            <h3 className="text-xl md:text-2xl font-medium text-white/90 leading-relaxed px-4">
              {questionText}
            </h3>

            {hintText && (
              <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-400/80 bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20">
                <Lightbulb size={13} />
                <span>Подсказка: {hintText}</span>
              </div>
            )}

            <p className="absolute bottom-5 text-white/30 text-xs font-light">
              Нажмите, чтобы перевернуть
            </p>
          </div>

          {/* Обратная сторона (Ответ) */}
          <div
            className="absolute inset-0 w-full h-full bg-indigo-950/50 border border-indigo-500/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-2xl"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <span className="absolute top-4 left-4 text-[10px] font-bold tracking-widest text-indigo-400 uppercase">
              Ответ
            </span>
            <p className="text-base md:text-lg text-indigo-100 leading-relaxed px-4">
              {answerText}
            </p>
          </div>
        </div>
      </div>

      {/* Кнопки управления и оценки */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="p-3 rounded-xl bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:text-white/50"
          title="Предыдущая"
        >
          <ArrowLeft size={20} />
        </button>

        <div className={`flex items-center gap-3 transition-opacity duration-300 ${isFlipped ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <button
            onClick={handleNext}
            className="px-4 py-2.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded-xl flex items-center gap-2 text-sm font-medium transition-all"
          >
            <X size={16} /> Забыл
          </button>
          <button
            onClick={handleNext}
            className="px-4 py-2.5 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-xl flex items-center gap-2 text-sm font-medium transition-all"
          >
            <RefreshCw size={16} /> Смутно
          </button>
          <button
            onClick={handleNext}
            className="px-4 py-2.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-sm font-medium transition-all"
          >
            <Check size={16} /> Помню
          </button>
        </div>

        <button
          onClick={handleNext}
          className="p-3 rounded-xl bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all"
          title="Следующая"
        >
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}