import React, { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { authTMA } from '../api/tmaAuth';
import { TmaHome } from './views/TmaHome';
import { TmaNotes } from './views/TmaNotes';
import { TmaFocus } from './views/TmaFocus';
import { Brain, FileText, Target } from 'lucide-react';

export function TMALayout() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'notes' | 'focus'>('home');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
      WebApp.enableClosingConfirmation();
      
      const initData = WebApp.initData;
      if (initData) {
        authTMA(initData)
          .then(res => {
            localStorage.setItem('tma_token', res.token);
            setIsAuthenticated(true);
          })
          .catch(err => {
            console.error("TMA Auth failed:", err);
            WebApp.showAlert("Failed to authenticate.");
          });
      } else {
        // Fallback for dev without telegram
        setIsAuthenticated(true);
      }
    } catch (e) {
      console.warn("WebApp API not available or error:", e);
      setIsAuthenticated(true); // Fallback for pure browser test
    }
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[var(--tg-theme-bg-color)] text-[var(--tg-theme-text-color)]">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[var(--tg-theme-bg-color)] text-[var(--tg-theme-text-color)] font-sans overflow-hidden select-none">
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'home' && <TmaHome activeFolder={activeFolder} onSelectFolder={setActiveFolder} />}
        {activeTab === 'notes' && <TmaNotes />}
        {activeTab === 'focus' && <TmaFocus />}
      </div>
      
      {/* Bottom Navigation */}
      <div className="flex bg-[var(--tg-theme-secondary-bg-color)] border-t border-[var(--tg-theme-hint-color)] border-opacity-20 pb-safe">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'home' ? 'text-[var(--tg-theme-button-color)]' : 'text-[var(--tg-theme-hint-color)]'}`}
        >
          <Brain className="w-6 h-6" />
          <span className="text-[10px] font-medium">Тренировка</span>
        </button>
        <button 
          onClick={() => setActiveTab('notes')}
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'notes' ? 'text-[var(--tg-theme-button-color)]' : 'text-[var(--tg-theme-hint-color)]'}`}
        >
          <FileText className="w-6 h-6" />
          <span className="text-[10px] font-medium">Заметки</span>
        </button>
        <button 
          onClick={() => setActiveTab('focus')}
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'focus' ? 'text-[var(--tg-theme-button-color)]' : 'text-[var(--tg-theme-hint-color)]'}`}
        >
          <Target className="w-6 h-6" />
          <span className="text-[10px] font-medium">Фокус</span>
        </button>
      </div>
    </div>
  );
}
