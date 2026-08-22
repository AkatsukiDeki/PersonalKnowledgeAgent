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
import { TimelineWorkspace } from './pages/TimelineWorkspace';
import { UniverseCanvas } from './components/universe/UniverseCanvas';
import { LearningDashboard } from './pages/LearningDashboard';
import { SemanticSearchModal } from './components/search/SemanticSearchModal';
import { DocumentEditorModal } from './components/sources/DocumentEditorModal';
import { SettingsModal } from './components/settings/SettingsModal';

import { Search, PanelRightOpen, Settings } from 'lucide-react';
import { useLanguage } from './context/LanguageContext';
import clsx from 'clsx';
import { InspectorProvider } from './context/InspectorContext';
import { EntityInspector } from './components/inspector/EntityInspector';

export function App() {
  const { t } = useLanguage();
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
    window.addEventListener('openConversation', handleOpenConversation);
    return () => window.removeEventListener('openConversation', handleOpenConversation);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
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
    <main className="h-screen w-screen bg-[#030303] text-slate-200 font-sans flex flex-col overflow-hidden relative isolate">

      {/* 2. Тот самый космический градиент на фоне всего приложения */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent -z-10 pointer-events-none" />

      {/* 3. Плавающий Command Bar (HUD) */}
      <header className="absolute top-6 left-1/2 -translate-x-1/2 h-12 px-4 rounded-2xl border border-white/10 flex items-center gap-6 bg-[#0a0a0a]/60 backdrop-blur-md z-40 shadow-2xl">
        {/* Кнопка Меню */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors"
          title="Open Nav"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>

        {/* Триггер поиска */}
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/5 text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-all text-sm font-light group"
        >
          <Search size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          <span>{t('nav.dialogs') === 'Chat' ? 'Search memory...' : 'Поиск по памяти...'}</span>
          <kbd className="ml-4 font-mono text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 group-hover:text-white/50 transition-colors">
            Ctrl+K
          </kbd>
        </button>

        {activeView === 'universe' && (
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/5">
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

        {/* Управление орбитой */}
        <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
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
      <div className="absolute inset-0 z-10 flex flex-col">
        <main className={clsx("flex-1 h-screen overflow-y-auto w-full", 
          (activeView !== 'chat' && activeView !== 'universe') ? "pt-24 px-8 pb-12" : ""
        )}>
          <div className={clsx("mx-auto w-full h-full relative", 
            (activeView !== 'chat' && activeView !== 'universe') ? "max-w-7xl" : ""
          )}>
            {activeView === 'chat' && (
              <ChatWorkspace
                onOrbitUpdate={setOrbitContext}
                seedPrompt={chatSeed}
                onSeedConsumed={() => setChatSeed(null)}
              />
            )}

            {activeView === 'universe' && (
              <UniverseCanvas onOpenSubject={handleOpenSubjectFromUniverse} />
            )}

            {activeView === 'conflicts' && (
              <ConflictResolutionCenter />
            )}

            {activeView === 'insights' && (
              <InsightsWorkspace />
            )}

            {activeView === 'timeline' && (
              <TimelineWorkspace />
            )}

            {activeView === 'learning' && (
              <LearningDashboard 
                initialSubjectId={learningSubjectId} 
                initialTab={learningInitialTab} 
              />
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

      {/* Глобальный инспектор сущностей */}
      <EntityInspector />
    </main>
    </InspectorProvider>
  );
}

export default App;