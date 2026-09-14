import React, { useState, useEffect } from 'react';
import { subjectsApi } from '../../api/subjects';
import { QuizSessionModal } from './QuizSessionModal';
import { FlashcardsSessionModal } from './FlashcardsSessionModal';
import { 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Circle, 
  BookOpen, 
  Layers, 
  MessageSquare,
  RefreshCw,
  BrainCircuit
} from 'lucide-react';
import clsx from 'clsx';
import { learningApi } from '../../api/learning';

interface SubjectRoadmapProps {
  subjectId: string;
  onOpenTutor?: (topicId: string, topicTitle: string) => void;
}

export const SubjectRoadmap: React.FC<SubjectRoadmapProps> = ({ subjectId, onOpenTutor }) => {
  const [roadmap, setRoadmap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [masteries, setMasteries] = useState<Record<string, any>>({});
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState('');

  const [activePractice, setActivePractice] = useState<{
    type: 'quiz' | 'flashcard';
    topicId: string;
    topicName: string;
  } | null>(null);

  const loadRoadmap = async () => {
    try {
      setLoading(true);
      const data = await subjectsApi.getSubject(subjectId);
      if (data && data.roadmap) {
        // Backend may return roadmap already unwrapped (content directly) or wrapped in .content
        const content = data.roadmap.content || data.roadmap;
        setRoadmap(content);
      }
      
      const masteryStats = await learningApi.getMasteryStats(subjectId);
      const masteryMap: Record<string, any> = {};
      if (Array.isArray(masteryStats)) {
        masteryStats.forEach((m: any) => {
          masteryMap[m.topic_name] = m;
        });
      }
      setMasteries(masteryMap);
    } catch (e) {
      console.error('Failed to load roadmap:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoadmap();
  }, [subjectId]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await subjectsApi.generateRoadmap(subjectId);
      const content = res.roadmap?.content || res.roadmap;
      setRoadmap(content);
    } catch (e) {
      console.error('Failed to generate roadmap:', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      setGenerating(true);
      setShowRegenModal(false);
      const res = await subjectsApi.generateRoadmap(subjectId, regenPrompt.trim() || undefined);
      const content = res.roadmap?.content || res.roadmap;
      setRoadmap(content);
      setRegenPrompt('');
    } catch (e) {
      console.error('Ошибка перегенерации:', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleAskTutor = async (topicId: string, topicTitle: string) => {
    try {
      await subjectsApi.updateNodeStatus(subjectId, topicId, 'in_progress');
      await loadRoadmap();
    } catch (e) {
      console.error(e);
    }
    if (onOpenTutor) {
      onOpenTutor(topicId, topicTitle);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-zinc-400">
        <RefreshCw className="animate-spin text-indigo-500 mb-3" size={28} />
        <p className="text-xs text-zinc-400">Загрузка дорожной карты...</p>
      </div>
    );
  }

  if (!roadmap || !roadmap.modules || roadmap.modules.length === 0) {
    return (
      <div className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-12 text-center">
        <Sparkles className="mx-auto text-indigo-400 mb-4" size={36} />
        <h3 className="text-base font-semibold text-white mb-1.5">Дорожная карта не сформирована</h3>
        <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-6">
          Сгенерируйте пошаговый трек обучения на основе привязанных материалов.
        </p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
        >
          {generating ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
          {generating ? 'Генерация плана...' : 'Построить дорожную карту'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок дорожной карты */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Дорожная карта</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Пошаговый трек освоения тем предмета</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-300 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={clsx(generating && 'animate-spin')} />
            <span>Обновить</span>
          </button>

          <button
            onClick={() => setShowRegenModal(true)}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl transition-all disabled:opacity-50"
          >
            <Sparkles size={13} className="text-indigo-400" />
            <span>Пересобрать карту</span>
          </button>
        </div>
      </div>

      {/* Список модулей */}
      <div className="space-y-5 pb-24">
        {roadmap.modules.map((module: any, mIdx: number) => (
          <div 
            key={module.id || `mod_${mIdx}`} 
            className="bg-[#111115] border border-zinc-800/80 rounded-2xl p-5 md:p-6"
          >
            {/* Заголовок модуля */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-zinc-800/60">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-xs shrink-0">
                {mIdx + 1}
              </span>
              <h3 className="text-sm font-bold text-white tracking-tight">{module.title}</h3>
            </div>

            {/* Темы модуля */}
            <div className="space-y-2.5">
              {(module.topics || []).map((topic: any, tIdx: number) => {
                const topicId = topic.id || topic.topic_id || `t_${mIdx}_${tIdx}`;
                const status = topic.status || 'not_started';
                const mastery = masteries[topic.title || topicId];
                const masteryLevel = mastery ? Math.round(mastery.mastery_level * 100) : null;
                // SM-2 бейдж: если срок повторения истёк
                const isDueForReview = (() => {
                  if (!mastery?.next_review_due) return false;
                  return new Date(mastery.next_review_due) <= new Date();
                })();
                
                return (
                  <div
                    key={topicId}
                    className={clsx(
                      'p-3.5 md:p-4 rounded-xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4',
                      status === 'completed'
                        ? 'bg-emerald-950/10 border-emerald-500/30'
                        : status === 'in_progress'
                        ? 'bg-amber-950/10 border-amber-500/30'
                        : 'bg-zinc-900/60 border-zinc-800/70 hover:border-zinc-700/80'
                    )}
                  >
                    {/* Статус и название темы */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="shrink-0">
                        {status === 'completed' && <CheckCircle2 size={16} className="text-emerald-400" />}
                        {status === 'in_progress' && <Clock size={16} className="text-amber-400" />}
                        {status === 'not_started' && <Circle size={16} className="text-zinc-600" />}
                      </div>
                      <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-2">
                        <h4 className="text-xs md:text-sm font-medium text-zinc-100 truncate">
                          {topic.title}
                        </h4>
                        {masteryLevel !== null && (
                          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded w-fit shrink-0">
                            <BrainCircuit size={10} />
                            Mastery: {masteryLevel}%
                          </div>
                        )}
                        {isDueForReview && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md shrink-0"
                            title="Интервал SM-2 подошёл к концу: пора повторить тему"
                          >
                            <Clock className="w-3 h-3 text-amber-400" />
                            Повторить
                          </span>
                        )}
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                          {status === 'completed' ? 'Освоено' : status === 'in_progress' ? 'В процессе' : 'В очереди'}
                        </span>
                      </div>
                    </div>

                    {/* Кнопки действий (аккуратный единый стиль, без переносов) */}
                    <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto">
                      <button
                        onClick={() =>
                          setActivePractice({
                            type: 'flashcard',
                            topicId,
                            topicName: topic.title,
                          })
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 hover:border-zinc-600 transition-all whitespace-nowrap"
                      >
                        <Layers size={13} className="text-zinc-400" />
                        <span>Флеш-карточки</span>
                      </button>

                      <button
                        onClick={() =>
                          setActivePractice({
                            type: 'quiz',
                            topicId,
                            topicName: topic.title,
                          })
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 hover:border-zinc-600 transition-all whitespace-nowrap"
                      >
                        <BookOpen size={13} className="text-zinc-400" />
                        <span>Квиз</span>
                      </button>

                      <button
                        onClick={() => handleAskTutor(topicId, topic.title)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 border border-indigo-500/25 hover:border-indigo-500/40 transition-all whitespace-nowrap"
                      >
                        <MessageSquare size={13} className="text-indigo-400" />
                        <span>Разобрать с тьютором</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Модальные окна */}
      {activePractice?.type === 'quiz' && (
        <QuizSessionModal
          subjectId={subjectId}
          topicId={activePractice.topicId}
          topicName={activePractice.topicName}
          onClose={() => setActivePractice(null)}
          onComplete={async () => {
            setActivePractice(null);
            await loadRoadmap();
          }}
        />
      )}

      {activePractice?.type === 'flashcard' && (
        <FlashcardsSessionModal
          subjectId={subjectId}
          topicId={activePractice.topicId}
          topicName={activePractice.topicName}
          onClose={() => setActivePractice(null)}
          onComplete={async () => {
            setActivePractice(null);
            await loadRoadmap();
          }}
        />
      )}

      {/* Модальное окно пересборки карты */}
      {showRegenModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-100">Пересобрать дорожную карту</h3>
            <p className="text-xs text-zinc-400">
              Укажите, что изменить или на чём сделать акцент. Например: «меньше теории, больше практических задач». Оставьте пустым для случайного альтернативного плана.
            </p>
            <textarea
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              placeholder="Пожелания к новой структуре..."
              className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowRegenModal(false); setRegenPrompt(''); }}
                className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleRegenerate}
                className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                Сгенерировать заново
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

