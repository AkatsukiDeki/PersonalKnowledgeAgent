import React, { useState, useEffect } from 'react';
import { Subject, subjectsApi } from '../../api/subjects';
import { ArrowLeft, BookOpen, MessageSquare, Map, BarChart2, Award, SlidersHorizontal, GraduationCap } from 'lucide-react';
import clsx from 'clsx';
import { SubjectRoadmap } from './SubjectRoadmap';
import { SubjectMaterials } from './SubjectMaterials';
import { SubjectTutorChat } from './SubjectTutorChat';
import { SubjectStats } from './SubjectStats';
import { CustomPracticeModal } from './CustomPracticeModal';
import { QuizSessionModal } from './QuizSessionModal';
import { FlashcardsSessionModal } from './FlashcardsSessionModal';
import { useLanguage } from '../../context/LanguageContext';

type Tab = 'roadmap' | 'materials' | 'tutor' | 'stats' | 'sources';

export const SubjectWorkspace: React.FC<{ subjectId: string; onBack: () => void; initialTab?: Tab }> = ({ subjectId, onBack, initialTab }) => {
  const { t } = useLanguage();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (initialTab && ['roadmap', 'materials', 'sources', 'tutor', 'stats'].includes(initialTab)) {
      return initialTab === 'sources' ? 'materials' : initialTab;
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`pka_subject_tab_${subjectId}`);
      if (saved && ['roadmap', 'materials', 'sources', 'tutor', 'stats'].includes(saved)) {
        return (saved === 'sources' ? 'materials' : saved) as Tab;
      }
    }
    return 'roadmap';
  });

  useEffect(() => {
    localStorage.setItem(`pka_subject_tab_${subjectId}`, activeTab);
  }, [activeTab, subjectId]);
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState('');

  const [initialTutorTopic, setInitialTutorTopic] = useState<{ id: string; title: string } | null>(null);
  const [isPracticeModalOpen, setIsPracticeModalOpen] = useState(false);
  const [quizSession, setQuizSession] = useState<{ topicId: string; topicName: string; isExam: boolean; params?: any } | null>(null);
  const [flashcardSession, setFlashcardSession] = useState<{ topicId: string; topicName: string; params?: any } | null>(null);

  useEffect(() => {
    if (initialTab && ['roadmap', 'materials', 'sources', 'tutor', 'stats'].includes(initialTab)) {
      setActiveTab(initialTab === 'sources' ? 'materials' : initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    subjectsApi.getSubject(subjectId).then((data) => {
      setSubject(data);
      setEditTitle(data.title);
      setEditDesc(data.description || '');
    });
  }, [subjectId]);

  const handleUpdateTitle = async () => {
    setIsEditingTitle(false);
    if (editTitle.trim() !== subject?.title && subject) {
      const updated = await subjectsApi.updateSubject(subject.id, { title: editTitle.trim() });
      setSubject(updated);
    }
  };

  const handleUpdateDesc = async () => {
    setIsEditingDesc(false);
    if (editDesc.trim() !== subject?.description && subject) {
      const updated = await subjectsApi.updateSubject(subject.id, { description: editDesc.trim() });
      setSubject(updated);
    }
  };

  if (!subject) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  const tabs = [
    { id: 'roadmap', label: t('learning.roadmap'), icon: Map },
    { id: 'materials', label: t('learning.materials'), icon: BookOpen },
    { id: 'tutor', label: t('learning.tutor'), icon: MessageSquare },
    { id: 'stats', label: t('learning.stats'), icon: BarChart2 },
  ] as const;

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0c] overflow-hidden text-zinc-100">
      {/* Header */}
      <header className="shrink-0 border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            {isEditingTitle ? (
              <input
                autoFocus
                className="text-2xl font-bold text-white bg-zinc-800 border-none outline-none rounded px-2"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={handleUpdateTitle}
                onKeyDown={e => e.key === 'Enter' && handleUpdateTitle()}
              />
            ) : (
              <h1 
                className="text-2xl font-bold text-white cursor-pointer hover:text-indigo-400 transition-colors"
                onClick={() => setIsEditingTitle(true)}
              >
                {subject.title}
              </h1>
            )}
            
            {isEditingDesc ? (
              <input
                autoFocus
                className="text-sm text-zinc-300 bg-zinc-800 border-none outline-none rounded px-2 w-full mt-1 min-w-[300px]"
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                onBlur={handleUpdateDesc}
                onKeyDown={e => e.key === 'Enter' && handleUpdateDesc()}
              />
            ) : (
              <p 
                className="text-zinc-400 text-sm cursor-pointer hover:text-indigo-400 transition-colors mt-1"
                onClick={() => setIsEditingDesc(true)}
              >
                {subject.description || 'Нажмите, чтобы добавить описание предмета...'}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {subject.is_mastered && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-md font-semibold text-[11px]">
              <Award size={13} /> Mastered
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPracticeModalOpen(true)}
              className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white px-3 py-1.5 rounded-xl transition-all text-xs font-medium shadow-sm"
            >
              <SlidersHorizontal size={13} className="text-zinc-400" />
              <span>Кастомная практика</span>
            </button>
            <button
              onClick={() => setQuizSession({ topicId: 'all', topicName: 'Global Exam', isExam: true })}
              className="flex items-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 hover:border-indigo-500/50 px-3 py-1.5 rounded-xl transition-all text-xs font-medium shadow-sm"
            >
              <GraduationCap size={14} className="text-indigo-400" />
              <span>Сдать экзамен</span>
            </button>
          </div>
          <div className="hidden md:block w-px h-5 bg-zinc-800 mx-1"></div>
          <div className="flex items-center bg-zinc-900 rounded-lg p-1 border border-zinc-800">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all",
                  activeTab === tab.id 
                    ? "bg-zinc-800 text-white shadow-sm" 
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                )}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
        {activeTab === 'roadmap' && (
          <SubjectRoadmap 
            subjectId={subject.id} 
            onOpenTutor={(topicId, topicTitle) => {
              setInitialTutorTopic({ id: topicId, title: topicTitle || '' });
              setActiveTab('tutor');
            }}
          />
        )}
        
        {activeTab === 'materials' && (
          <SubjectMaterials subjectId={subject.id} />
        )}
        
        {activeTab === 'tutor' && (
          <SubjectTutorChat 
            subjectId={subject.id} 
            initialContext={initialTutorTopic}
            onClearContext={() => setInitialTutorTopic(null)}
          />
        )}
        
        {activeTab === 'stats' && (
          <SubjectStats subjectId={subject.id} />
        )}
        </div>
      </main>

      {isPracticeModalOpen && (
        <CustomPracticeModal
          subjectId={subject.id}
          sources={subject.sources}
          roadmap={subject.roadmap}
          onStart={(config) => {
            setIsPracticeModalOpen(false);
            if (config.type === 'quiz') {
              setQuizSession({ 
                topicId: config.nodeId || 'all', 
                topicName: config.topicTitle || 'Сборная тренировка', 
                isExam: false, 
                params: { count: config.count, difficulty: config.difficulty } 
              });
            } else {
              setFlashcardSession({ 
                topicId: config.nodeId || 'all', 
                topicName: config.topicTitle || 'Сборная тренировка', 
                params: { count: config.count, difficulty: config.difficulty } 
              });
            }
          }}
          onClose={() => setIsPracticeModalOpen(false)}
        />
      )}

      {quizSession && (
        <QuizSessionModal
          subjectId={subject.id}
          topicId={quizSession.topicId}
          topicName={quizSession.topicName}
          isExam={quizSession.isExam}
          practiceParams={quizSession.params}
          onClose={() => setQuizSession(null)}
          onComplete={(score) => {
             // We can refresh stats or something, but modal handles itself.
          }}
        />
      )}

      {flashcardSession && (
        <FlashcardsSessionModal
          subjectId={subject.id}
          topicId={flashcardSession.topicId}
          topicName={flashcardSession.topicName}
          practiceParams={flashcardSession.params}
          onClose={() => setFlashcardSession(null)}
          onComplete={(score) => {
            // refresh
          }}
        />
      )}
    </div>
  );
};
