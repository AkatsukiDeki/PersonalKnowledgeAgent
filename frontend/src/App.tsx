import React, { useState, useEffect, useRef } from 'react';
import { Sidebar, ViewType } from './components/layout/Sidebar';
import { MemoryOrbit } from './components/layout/MemoryOrbit';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { SourceUploader } from './components/sources/SourceUploader';
import { SourceManager } from './components/sources/SourceManager';
import { ConflictResolutionCenter } from './components/conflicts/ConflictResolutionCenter';
import { OrbitContext } from './types/chat';
import { SearchResult } from './api/search';

import { InsightsWorkspace } from './pages/InsightsWorkspace';
import { TranscriptsWorkspace } from './pages/TranscriptsWorkspace';
import { TimelineWorkspace } from './pages/TimelineWorkspace';
import { UniverseCanvas } from './components/universe/UniverseCanvas';
import { LearningStudio } from './components/learning/LearningStudio';
import { SemanticSearchModal } from './components/search/SemanticSearchModal';
import { DocumentEditorModal } from './components/sources/DocumentEditorModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { CommandPaletteModal } from './components/common/CommandPaletteModal';
import { CommandItem } from './commands/types';

import { Search, PanelRightOpen, Settings, X } from 'lucide-react';
import { useLanguage } from './context/LanguageContext';
import clsx from 'clsx';
import { InspectorProvider } from './context/InspectorContext';
import { EntityInspector } from './components/inspector/EntityInspector';
import { FocusTimerWidget } from './components/focus/FocusTimerWidget';

export function App() {
  const { t } = useLanguage();
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pka_active_view');
      if (saved) return saved as ViewType;
    }
    return 'chat';
  });
  const [semanticFilter, setSemanticFilter] = useState<'all' | 'insights' | 'decisions'>('all');

  useEffect(() => {
    localStorage.setItem('pka_active_view', activeView);
  }, [activeView]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [orbitOpen, setOrbitOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1280;
    }
    return true;
  });

  const [orbitContext, setOrbitContext] = useState<OrbitContext | null>(null);
  const [universeFocusId, setUniverseFocusId] = useState<string | null>(null);
  const [inspectSourceId, setInspectSourceId] = useState<string | null>(null);
  const [chatSeed, setChatSeed] = useState<string | null>(null);
  const [learningSubjectId, setLearningSubjectId] = useState<string | null>(null);
  const [learningInitialTab, setLearningInitialTab] = useState<'roadmap' | 'sources' | 'tutor' | 'stats'>('roadmap');

  const handleOpenSubjectFromUniverse = (subjectId: string, initialTab: 'roadmap' | 'sources' | 'tutor' | 'stats' = 'roadmap') => {
    setLearningSubjectId(subjectId);
    setLearningInitialTab(initialTab);
    setActiveView('learning');
  };
  useEffect(() => {
    const handleOpenConversation = () => {
      setActiveView('chat');
    };
    const handleAskInChat = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setChatSeed(customEvent.detail);
        setActiveView('chat');
      }
    };
    window.addEventListener('openConversation', handleOpenConversation);
    window.addEventListener('askInChat', handleAskInChat);
    return () => {
      window.removeEventListener('openConversation', handleOpenConversation);
      window.removeEventListener('askInChat', handleAskInChat);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setActiveView(prev => {
          if (['transcripts', 'insights', 'conflicts', 'timeline', 'learning'].includes(prev)) {
            return 'chat';
          }
          return prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveView(customEvent.detail);
      }
    };
    
    const handleFocusNode = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setUniverseFocusId(customEvent.detail);
        setActiveView('universe'); // Force view change
        if (activeView === 'universe') {
          // UniverseCanvas handles focus automatically via its internal effect
        }
      }
    };
    
    const handleSwitchFilter = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setSemanticFilter(customEvent.detail);
      }
    };

    window.addEventListener('switchTab', handleSwitchTab);
    window.addEventListener('focusNode', handleFocusNode);
    window.addEventListener('switchFilter', handleSwitchFilter);
    return () => {
      window.removeEventListener('switchTab', handleSwitchTab);
      window.removeEventListener('focusNode', handleFocusNode);
      window.removeEventListener('switchFilter', handleSwitchFilter);
    };
  }, [activeView]);

  useEffect(() => {
    // UniverseCanvas handles focus via focusNodeId prop / Context
  }, [activeView, universeFocusId]);

  const handleSelectSearchResult = (result: SearchResult) => {
    const targetId = result.claim_id || result.chunk_id || result.source_id;
    setUniverseFocusId(targetId);
    setActiveView('universe');
  };

  const showOrbit = activeView === 'chat' && orbitOpen;

  return (
    <InspectorProvider>
    {/* 1. Глубокий фон с изоляцией контекста */}
    <main className="h-[100dvh] w-screen bg-[#030303] text-slate-200 font-sans flex flex-col overflow-hidden relative isolate">

      {/* 2. Тот самый космический градиент на фоне всего приложения */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent -z-10 pointer-events-none" />

      {/* 3. Плавающий Command Bar (HUD) */}
      <header id="global-hud-header" className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-2rem)] h-12 px-3 sm:px-4 rounded-2xl border border-white/10 flex items-center justify-center gap-3 md:gap-4 bg-[#0a0a0a]/80 backdrop-blur-xl z-40 shadow-2xl">
        {/* Кнопка Меню */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors shrink-0"
          title="Open Nav"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>

        {/* Триггер глобального поиска (скрываем во Вселенной, так как там свой поиск) */}
        {activeView !== 'universe' && (
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="flex items-center justify-start gap-2 p-2 sm:px-3 sm:py-1.5 rounded-lg sm:bg-white/[0.04] sm:border border-transparent sm:border-white/5 text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-all text-sm font-light group w-12 sm:w-64"
          >
            <Search size={16} className="opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
            <span className="hidden sm:inline truncate">Команды и поиск...</span>
            <kbd className="hidden sm:inline-block ml-auto font-mono text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 group-hover:text-white/50 transition-colors shrink-0">
              Ctrl+K
            </kbd>
          </button>
        )}

        {activeView === 'universe' && (
          <div className="hidden md:flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setSemanticFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${semanticFilter === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'}`}
            >
              ✦ All
            </button>
            <button
              onClick={() => setSemanticFilter('insights')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${semanticFilter === 'insights' ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/40 hover:text-white/80'}`}
            >
              ⭐ Insights
            </button>
            <button
              onClick={() => setSemanticFilter('decisions')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${semanticFilter === 'decisions' ? 'bg-sky-500/20 text-sky-300' : 'text-white/40 hover:text-white/80'}`}
            >
              🪐 Decisions
            </button>
          </div>
        )}

        {/* Управление орбитой и фокус */}
        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <FocusTimerWidget />
          {activeView === 'chat' && !orbitOpen && (
            <button
              onClick={() => setOrbitOpen(true)}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
              title="Open Memory Orbit"
            >
              <PanelRightOpen size={16} strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
            title="Settings"
          >
            <Settings size={16} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* 4. Воркспейс (Canvas) */}
      <div className="absolute inset-0 flex flex-col">
        <main className={clsx("flex-1 h-[100dvh] overflow-y-auto w-full", 
          (activeView !== 'chat' && activeView !== 'universe') ? "pt-20 sm:pt-24 px-3 sm:px-8 pb-12" : ""
        )}>
          <div className={clsx("mx-auto w-full h-full relative", 
            (activeView !== 'chat' && activeView !== 'universe') ? "max-w-7xl" : ""
          )}>
            {/* Base Layer: ChatWorkspace is always mounted unless we are in Universe 3D Canvas */}
            {activeView !== 'universe' && (
              <ChatWorkspace
                onOrbitUpdate={setOrbitContext}
                seedPrompt={chatSeed}
                onSeedConsumed={() => setChatSeed(null)}
              />
            )}

            {activeView === 'universe' && (
              <UniverseCanvas onOpenSubject={handleOpenSubjectFromUniverse} />
            )}

            {/* Modals Layer: Workspaces rendered as Modals over Chat */}
            {['conflicts', 'insights', 'transcripts', 'timeline', 'learning'].includes(activeView) && (
              <div 
                className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 bg-black/60 backdrop-blur-md animate-fadeIn"
                onClick={() => setActiveView('chat')}
              >
                <div 
                  className="relative w-full max-w-6xl h-[85vh] bg-[#0d1117]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button 
                    onClick={() => setActiveView('chat')}
                    className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors border border-white/5"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex-1 overflow-auto p-0 sm:p-2 md:p-4">
                    {activeView === 'conflicts' && <ConflictResolutionCenter />}
                    {activeView === 'insights' && <InsightsWorkspace />}
                    {activeView === 'transcripts' && <TranscriptsWorkspace />}
                    {activeView === 'timeline' && <TimelineWorkspace />}
                    {activeView === 'learning' && (
                      <LearningStudio />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Плавающие панели */}
      <Sidebar
        onOpenUploader={() => setIsUploaderOpen(true)}
        onOpenManager={() => setIsManagerOpen(true)}
        activeView={activeView}
        onChangeView={(view) => {
          setActiveView(view);
          setSidebarOpen(false);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="absolute top-0 right-0 h-full z-30 pointer-events-none">
        <div className="pointer-events-auto h-full">
          <MemoryOrbit
            isOpen={showOrbit}
            onClose={() => setOrbitOpen(false)}
            context={orbitContext}
          />
        </div>
      </div>

      {/* Модалки */}
      <SourceUploader
        isOpen={isUploaderOpen}
        onClose={() => setIsUploaderOpen(false)}
      />

      <SourceManager
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
      />

      <SemanticSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
      />

      {inspectSourceId && (
        <DocumentEditorModal
          sourceId={inspectSourceId}
          onClose={() => setInspectSourceId(null)}
          onSaved={() => setInspectSourceId(null)}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenSource={(id) => setInspectSourceId(id)}
        commands={[
          {
            id: 'open-chat',
            title: 'Открыть чат',
            description: 'Вернуться к главному диалогу',
            category: 'navigation',
            keywords: ['chat', 'чат', 'разговор'],
            execute: () => setActiveView('chat')
          },
          {
            id: 'open-universe',
            title: 'Вселенная',
            description: 'Открыть граф знаний',
            category: 'navigation',
            keywords: ['universe', 'graph', 'вселенная', 'граф', 'карта'],
            execute: () => setActiveView('universe')
          },
          {
            id: 'upload-source',
            title: 'Добавить источник',
            description: 'Загрузить файл, аудио, или текст',
            category: 'action',
            keywords: ['upload', 'add', 'загрузить', 'добавить', 'файл', 'источник'],
            execute: () => setIsUploaderOpen(true)
          },
          {
            id: 'manage-sources',
            title: 'Менеджер источников',
            description: 'Управление загруженными данными',
            category: 'navigation',
            keywords: ['sources', 'источники', 'управление', 'менеджер'],
            execute: () => setIsManagerOpen(true)
          },
          {
            id: 'learning-dashboard',
            title: 'Обучение',
            description: 'Открыть дашборд обучения',
            category: 'navigation',
            keywords: ['learning', 'study', 'обучение', 'скиллы', 'skills'],
            execute: () => setActiveView('learning')
          },
          {
            id: 'open-settings',
            title: 'Настройки',
            description: 'Открыть настройки приложения',
            category: 'action',
            keywords: ['settings', 'настройки', 'конфигурация'],
            execute: () => setIsSettingsOpen(true)
          },
          {
            id: 'semantic-search',
            title: 'Семантический поиск',
            description: 'Глубокий поиск по всей базе знаний',
            category: 'action',
            keywords: ['search', 'поиск', 'найти', 'семантика'],
            execute: () => setIsSearchOpen(true)
          }
        ]}
        onAskChat={(query) => {
          setChatSeed(query);
          setActiveView('chat');
        }}
      />

      {/* Глобальный инспектор сущностей */}
      <EntityInspector />
    </main>
    </InspectorProvider>
  );
}

export default App;