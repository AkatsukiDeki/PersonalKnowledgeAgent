import React, { useState } from 'react';
import { X, Sliders, Play, BookOpen, Layers, Target, FileText } from 'lucide-react';
import { SourceItem } from '../../api/sources';
import clsx from 'clsx';

interface TopicOption {
  id: string;
  title: string;
  moduleTitle?: string;
}

interface CustomPracticeModalProps {
  subjectId: string;
  sources?: SourceItem[];
  roadmap?: {
    modules?: Array<{
      id?: string;
      title: string;
      topics?: Array<{
        id: string;
        title: string;
      }>;
    }>;
  } | null;
  onClose: () => void;
  onStart: (config: {
    type: 'quiz' | 'flashcard';
    nodeId: string | null;
    topicTitle: string | null;
    difficulty: 'easy' | 'medium' | 'hard';
    count: number;
  }) => void;
}

export const CustomPracticeModal: React.FC<CustomPracticeModalProps> = ({
  sources = [],
  roadmap,
  onClose,
  onStart,
}) => {
  const [practiceType, setPracticeType] = useState<'quiz' | 'flashcard'>('quiz');
  const [focusMode, setFocusMode] = useState<'all' | 'topic' | 'source'>('all');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [count, setCount] = useState<number>(10);

  // Извлекаем все темы из дорожной карты
  const allTopics: TopicOption[] = (roadmap?.modules || []).flatMap((mod, modIdx) =>
    (mod.topics || []).map((t, topicIdx) => ({
      id: t.id || `topic_${modIdx}_${topicIdx}`,
      title: t.title,
      moduleTitle: mod.title,
    }))
  );

  const handleLaunch = () => {
    let chosenTopicTitle: string | null = null;
    let chosenNodeId: string | null = null;

    if (focusMode === 'topic' && selectedTopicId) {
      const foundTopic = allTopics.find((t) => t.id === selectedTopicId);
      if (foundTopic) {
        chosenTopicTitle = foundTopic.title;
        chosenNodeId = foundTopic.id;
      }
    } else if (focusMode === 'source' && selectedSourceId) {
      const foundSource = sources.find((s) => s.id === selectedSourceId);
      if (foundSource) {
        chosenTopicTitle = `Источник: ${foundSource.title}`;
        chosenNodeId = foundSource.id;
      }
    }

    onStart({
      type: practiceType,
      nodeId: chosenNodeId,
      topicTitle: chosenTopicTitle,
      difficulty,
      count,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Хедер */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sliders size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Кастомная тренировка</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Настройте фокус и параметры генерации</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* 1. Тип тренировки */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Тип практики
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPracticeType('quiz')}
                className={clsx(
                  'flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all',
                  practiceType === 'quiz'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                )}
              >
                <BookOpen size={16} /> Квиз / Тест
              </button>
              <button
                type="button"
                onClick={() => setPracticeType('flashcard')}
                className={clsx(
                  'flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all',
                  practiceType === 'flashcard'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                )}
              >
                <Layers size={16} /> Флеш-карточки
              </button>
            </div>
          </div>

          {/* 2. Область фокусировки (Фокус практики) */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Фокус материалов
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setFocusMode('all')}
                className={clsx(
                  'py-2 px-2.5 rounded-lg border text-xs font-semibold transition-all text-center',
                  focusMode === 'all'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:bg-zinc-800'
                )}
              >
                Весь предмет
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocusMode('topic');
                  if (!selectedTopicId && allTopics.length > 0) {
                    setSelectedTopicId(allTopics[0].id);
                  }
                }}
                className={clsx(
                  'py-2 px-2.5 rounded-lg border text-xs font-semibold transition-all text-center flex items-center justify-center gap-1',
                  focusMode === 'topic'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:bg-zinc-800'
                )}
              >
                <Target size={13} /> По теме
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocusMode('source');
                  if (!selectedSourceId && sources.length > 0) {
                    setSelectedSourceId(sources[0].id);
                  }
                }}
                className={clsx(
                  'py-2 px-2.5 rounded-lg border text-xs font-semibold transition-all text-center flex items-center justify-center gap-1',
                  focusMode === 'source'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:bg-zinc-800'
                )}
              >
                <FileText size={13} /> По источнику
              </button>
            </div>

            {/* Выпадающий список тем */}
            {focusMode === 'topic' && (
              <div className="animate-in fade-in duration-150">
                {allTopics.length > 0 ? (
                  <select
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(e.target.value)}
                    className="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {allTopics.map((topic, idx) => (
                      <option key={`top-opt-${topic.id}-${idx}`} value={topic.id}>
                        {topic.moduleTitle ? `[${topic.moduleTitle}] ` : ''}
                        {topic.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                    Дорожная карта пока пуста. Сгенерируйте её во вкладке «Дорожная карта».
                  </p>
                )}
              </div>
            )}

            {/* Выпадающий список источников */}
            {focusMode === 'source' && (
              <div className="animate-in fade-in duration-150">
                {sources.length > 0 ? (
                  <select
                    value={selectedSourceId}
                    onChange={(e) => setSelectedSourceId(e.target.value)}
                    className="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {sources.map((src, idx) => (
                      <option key={`src-opt-${src.id}-${idx}`} value={src.id}>
                        📄 {src.title} ({src.source_type})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                    К предмету не привязано ни одного источника. Добавьте материалы во вкладке «Материалы».
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 3. Уровень сложности */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Уровень сложности
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'easy', label: 'Базовый' },
                { id: 'medium', label: 'Средний' },
                { id: 'hard', label: 'Хардкор' },
              ].map((lvl) => (
                <button
                  key={`diff-${lvl.id}`}
                  type="button"
                  onClick={() => setDifficulty(lvl.id as any)}
                  className={clsx(
                    'py-2 px-3 rounded-lg border text-xs font-semibold transition-all text-center',
                    difficulty === lvl.id
                      ? 'bg-zinc-100 border-white text-zinc-950 font-bold'
                      : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  )}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Количество вопросов/карточек */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Количество вопросов / карточек
              </label>
              <span className="text-xs font-bold text-indigo-400">{count}</span>
            </div>
            <input
              type="range"
              min={3}
              max={25}
              step={1}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-indigo-500 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
              <span>3</span>
              <span>10</span>
              <span>25</span>
            </div>
          </div>
        </div>

        {/* Футер */}
        <div className="p-6 bg-zinc-950/40 border-t border-zinc-800/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-colors"
          >
            <Play size={14} className="fill-current" /> Запустить
          </button>
        </div>
      </div>
    </div>
  );
};
