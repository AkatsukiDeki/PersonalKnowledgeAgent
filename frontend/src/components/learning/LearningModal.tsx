import React, { useState, useEffect } from 'react';
import { X, Loader2, BookOpen, PenTool } from 'lucide-react';
import { learningApi, Flashcard, QuizQuestion } from '../../api/learning';
import { FlashcardsView } from './FlashcardsView';
import { QuizEngine } from './QuizEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceId?: string;
  topic?: string;
}

type Mode = 'select' | 'flashcards' | 'quiz';

export function LearningModal({ isOpen, onClose, sourceId, topic }: Props) {
  const [mode, setMode] = useState<Mode>('select');
  const [isLoading, setIsLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);

  useEffect(() => {
    if (isOpen) {
      setMode('select');
      setFlashcards([]);
      setQuizQuestions([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartFlashcards = async () => {
    setIsLoading(true);
    try {
      const cards = await learningApi.generateFlashcards({ source_id: sourceId, topic, count: 5 });
      setFlashcards(cards);
      setMode('flashcards');
    } catch (e) {
      console.error(e);
      alert("Ошибка при генерации карточек");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartQuiz = async () => {
    setIsLoading(true);
    try {
      const qs = await learningApi.generateQuiz({ source_id: sourceId, topic, count: 5 });
      setQuizQuestions(qs);
      setMode('quiz');
    } catch (e) {
      console.error(e);
      alert("Ошибка при генерации теста");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl h-[80vh] flex flex-col bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0 bg-white/[0.02]">
          <h2 className="text-lg font-medium text-white/90">
            {mode === 'select' && "Режим обучения"}
            {mode === 'flashcards' && "Флешкарточки"}
            {mode === 'quiz' && "Тестирование"}
          </h2>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white/90 rounded-lg hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-indigo-400">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm font-medium">Синтезируем материалы обучения...</p>
            </div>
          ) : mode === 'select' ? (
            <div className="h-full flex items-center justify-center p-6 gap-6">
              <button onClick={handleStartFlashcards} className="flex flex-col items-center justify-center gap-4 p-8 w-64 aspect-square rounded-2xl border border-white/10 bg-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/50 transition-all group">
                <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                  <BookOpen size={32} />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-medium text-white mb-2">Флешкарточки</h3>
                  <p className="text-xs text-white/50 leading-relaxed">Быстрое повторение фактов с помощью двусторонних карточек.</p>
                </div>
              </button>

              <button onClick={handleStartQuiz} className="flex flex-col items-center justify-center gap-4 p-8 w-64 aspect-square rounded-2xl border border-white/10 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all group">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <PenTool size={32} />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-medium text-white mb-2">Тестирование</h3>
                  <p className="text-xs text-white/50 leading-relaxed">Проверка знаний с объяснениями правильных вариантов.</p>
                </div>
              </button>
            </div>
          ) : mode === 'flashcards' ? (
            <FlashcardsView cards={flashcards} onComplete={() => setMode('select')} />
          ) : mode === 'quiz' ? (
            <QuizEngine questions={quizQuestions} onComplete={() => setMode('select')} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
