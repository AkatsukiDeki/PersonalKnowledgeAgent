import React, { useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { SourceUploader } from './components/sources/SourceUploader';
import { SourceManager } from './components/sources/SourceManager';
import { PatternDashboard } from './components/patterns/PatternDashboard';
import { KnowledgeGraphView } from './components/graph/KnowledgeGraphView';
import { ConflictResolutionCenter } from './components/conflicts/ConflictResolutionCenter';
import { ProactiveInsights } from './components/patterns/ProactiveInsights';

import { InsightsWorkspace } from './pages/InsightsWorkspace';
import { TimelineWorkspace } from './pages/TimelineWorkspace';
import { GraphWorkspace } from './pages/GraphWorkspace';

export function App() {
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'graph' | 'conflicts' | 'insights' | 'timeline'>('chat');

  return (
    <main className="h-screen w-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* Верхний бар */}
      <header className="h-13 border-b border-zinc-800 flex items-center px-5 justify-between shrink-0 bg-zinc-900/40">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-semibold text-xs text-zinc-200 tracking-wide">
            Personal Knowledge Agent
          </span>
        </div>
        <div className="text-[11px] text-zinc-500 font-mono">Hybrid RAG Engine (L1 Active)</div>
      </header>

      {/* Основная рабочая область */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar 
          onOpenUploader={() => setIsUploaderOpen(true)} 
          onOpenManager={() => setIsManagerOpen(true)}
          onOpenPatterns={() => setActiveView('insights')}
          onOpenGraph={() => setActiveView('graph')}
          onOpenConflicts={() => setActiveView('conflicts')}
          onOpenTimeline={() => setActiveView('timeline')}
          activeView={activeView}
        />
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {activeView === 'chat' && <ChatWorkspace />}
          {activeView === 'graph' && (
            <div className="w-full h-full bg-zinc-950">
              <GraphWorkspace />
            </div>
          )}
          {activeView === 'conflicts' && (
            <div className="w-full h-full relative flex flex-col">
              <button 
                onClick={() => setActiveView('chat')}
                className="absolute top-4 right-4 z-50 bg-white text-gray-800 px-3 py-1.5 rounded shadow border hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Close Conflicts
              </button>
              <ConflictResolutionCenter />
            </div>
          )}
          {activeView === 'insights' && (
            <div className="w-full h-full bg-zinc-950">
              <InsightsWorkspace />
            </div>
          )}
          {activeView === 'timeline' && (
            <div className="w-full h-full bg-zinc-950">
              <TimelineWorkspace />
            </div>
          )}
        </div>
      </div>

      {/* Модальные окна */}
      <SourceUploader
        isOpen={isUploaderOpen}
        onClose={() => setIsUploaderOpen(false)}
      />
      
      <SourceManager
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
      />
    </main>
  );
}

export default App;