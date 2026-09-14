import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api/client';
import WebApp from '@twa-dev/sdk';
import { PlayCircle } from 'lucide-react';
import { TmaHybridQuiz } from './TmaHybridQuiz';

export function TmaHome({ activeFolder, onSelectFolder }: { activeFolder: string | null, onSelectFolder: (folder: string | null) => void }) {
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPracticing, setIsPracticing] = useState(false);
  const [mode, setMode] = useState<'flashcards' | 'quiz'>('flashcards');

  const handleSelectFolder = (folder: string | null) => {
    onSelectFolder(folder);
    const userId = WebApp.initDataUnsafe?.user?.id;
    if (userId) {
      fetchApi('auth/bot/scope', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, folder_name: folder })
      }).catch(console.error);
    }
  };

  useEffect(() => {
    fetchApi<any>('sources/folders/tree')
      .then(res => {
        const flatten = (node: any, path: string = ''): string[] => {
          let result: string[] = [];
          if (!node || typeof node !== 'object') return result;
          for (const key in node) {
            const currentPath = path ? `${path}/${key}` : key;
            result.push(currentPath);
            if (node[key] && typeof node[key] === 'object' && node[key].children && Object.keys(node[key].children).length > 0) {
              result = result.concat(flatten(node[key].children, currentPath));
            }
          }
          return result;
        };
        const paths = flatten(res?.children || {});
        setFolders(Array.isArray(paths) ? paths : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (isPracticing) {
    return <TmaHybridQuiz folder={activeFolder} mode={mode} onBack={() => setIsPracticing(false)} />;
  }

  return (
    <div className="flex flex-col h-full bg-[var(--tg-theme-bg-color)]">
      <div className="p-4 bg-[var(--tg-theme-secondary-bg-color)] sticky top-0 z-10 shadow-sm border-b border-[var(--tg-theme-hint-color)] border-opacity-20">
        <h1 className="text-xl font-bold text-[var(--tg-theme-text-color)]">Практика</h1>
      </div>
      
      {/* Horizontal Folder Chips */}
      <div className="pt-4 pb-2 px-4 overflow-x-auto flex gap-2 no-scrollbar">
        <button
          onClick={() => handleSelectFolder(null)}
          className={`whitespace-nowrap px-4 py-2 rounded-full font-medium transition-colors ${
            activeFolder === null 
              ? 'bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]' 
              : 'bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)] border border-[var(--tg-theme-hint-color)] border-opacity-30'
          }`}
        >
          Вся база
        </button>
        {(folders || []).map(folder => (
          <button
            key={folder}
            onClick={() => handleSelectFolder(folder)}
            className={`whitespace-nowrap px-4 py-2 rounded-full font-medium transition-colors ${
              activeFolder === folder 
                ? 'bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]' 
                : 'bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)] border border-[var(--tg-theme-hint-color)] border-opacity-30'
            }`}
          >
            {folder?.split('/')?.pop() || folder}
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 flex flex-col justify-center items-center">
        {/* Segmented Control */}
        <div className="w-full max-w-sm flex bg-[var(--tg-theme-secondary-bg-color)] p-1 rounded-xl mb-8">
          <button
            className={`flex-1 py-2 text-center rounded-lg font-medium transition-colors ${
              mode === 'flashcards' 
                ? 'bg-[var(--tg-theme-bg-color)] text-[var(--tg-theme-text-color)] shadow-sm' 
                : 'text-[var(--tg-theme-hint-color)]'
            }`}
            onClick={() => setMode('flashcards')}
          >
            🗂 Карточки
          </button>
          <button
            className={`flex-1 py-2 text-center rounded-lg font-medium transition-colors ${
              mode === 'quiz' 
                ? 'bg-[var(--tg-theme-bg-color)] text-[var(--tg-theme-text-color)] shadow-sm' 
                : 'text-[var(--tg-theme-hint-color)]'
            }`}
            onClick={() => setMode('quiz')}
          >
            📝 Тест
          </button>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[var(--tg-theme-text-color)]">Готов начать?</h2>
          <p className="text-[var(--tg-theme-hint-color)] mt-2">
            Тема: {activeFolder || 'Случайные вопросы со всей базы'}
          </p>
        </div>

        <button 
          onClick={() => setIsPracticing(true)}
          className="w-full max-w-sm flex items-center justify-center gap-3 p-4 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-2xl shadow-lg active:scale-95 transition-transform"
        >
          <PlayCircle className="w-8 h-8" />
          <span className="font-bold text-xl">Начать практику</span>
        </button>
      </div>
    </div>
  );
}
