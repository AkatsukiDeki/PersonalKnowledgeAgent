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
import { GraphWorkspace } from './pages/GraphWorkspace';
import { KnowledgeGraphRef } from './components/graph/KnowledgeGraphView';
import { SemanticSearchModal } from './components/search/SemanticSearchModal';
import { DocumentEditorModal } from './components/sources/DocumentEditorModal';

import { Search, PanelRightOpen, Settings } from 'lucide-react';

export function App() {
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('chat');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const graphRef = useRef<KnowledgeGraphRef | null>(null);
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
    if (activeView !== 'universe' || !universeFocusId) return;
    graphRef.current?.focusNode(universeFocusId, 3.5);
  }, [activeView, universeFocusId]);

  const handleSelectSearchResult = (result: SearchResult) => {
    const targetId = result.claim_id || result.chunk_id || result.source_id;
    setUniverseFocusId(targetId);
    setActiveView('universe');
  };

  const showOrbit = activeView === 'chat' && orbitOpen;

  return (
    // 1. Глубокий фон с изоляцией контекста
    <main className="h-screen w-screen bg-[#030303] text-slate-200 font-sans flex flex-col overflow-hidden relative isolate">

      {/* 2. Тот самый космический градиент на фоне всего приложения */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent -z-10 pointer-events-none" />

      {/* 3. Хедер (функциональное стекло) */}
      <header className="h-14 border-b border-white/5 flex items-center px-5 justify-between shrink-0 bg-[#0a0a0a]/50 backdrop-blur-md z-20">

        {/* Логотип: Строгий, мерцающий, моноширинный */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-5 h-5">
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
          </div>
          <span className="font-mono text-[11px] tracking-[0.2em] text-white/80 uppercase mt-0.5">
            PKA Engine
          </span>
        </div>

        {/* Триггер поиска: Имитация Command Palette */}
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex items-center gap-3 px-4 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-white/40 hover:text-white/80 hover:bg-white/[0.06] hover:border-white/10 transition-all text-[13px] font-light group"
        >
          <Search size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          <span>Semantic Search...</span>
          <kbd className="ml-8 font-mono text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 group-hover:text-white/50 transition-colors">
            Ctrl+K
          </kbd>
        </button>

        {/* Элементы управления */}
        <div className="flex items-center gap-1.5">
          {activeView === 'chat' && !orbitOpen && (
            <button
              onClick={() => setOrbitOpen(true)}
              className="p-2 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
              title="Open Memory Orbit"
            >
              <PanelRightOpen size={16} strokeWidth={1.5} />
            </button>
          )}
          <button
            className="p-2 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/5 transition-all"
            title="Settings"
          >
            <Settings size={16} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* 4. Воркспейс */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        <Sidebar
          onOpenUploader={() => setIsUploaderOpen(true)}
          onOpenManager={() => setIsManagerOpen(true)}
          activeView={activeView}
          onChangeView={setActiveView}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <div className="flex-1 min-w-0 overflow-hidden relative flex flex-col bg-transparent">
          {activeView === 'chat' && (
            <ChatWorkspace
              onOrbitUpdate={setOrbitContext}
              seedPrompt={chatSeed}
              onSeedConsumed={() => setChatSeed(null)}
            />
          )}

          {activeView === 'universe' && (
            <div className="w-full h-full relative">
              <GraphWorkspace
                ref={graphRef}
                focusNodeId={universeFocusId}
                onSelectSource={(sourceId) => setInspectSourceId(sourceId)}
                onNavigateToChatWithContext={(contextText) => {
                  setChatSeed(contextText);
                  setActiveView('chat');
                }}
              />
            </div>
          )}

          {activeView === 'conflicts' && (
            <div className="w-full h-full relative flex flex-col">
              <ConflictResolutionCenter />
            </div>
          )}

          {activeView === 'insights' && (
            <div className="w-full h-full">
              <InsightsWorkspace />
            </div>
          )}

          {activeView === 'timeline' && (
            <div className="w-full h-full">
              <TimelineWorkspace />
            </div>
          )}
        </div>

        <MemoryOrbit
          isOpen={showOrbit}
          onClose={() => setOrbitOpen(false)}
          context={orbitContext}
        />
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
    </main>
  );
}

export default App;