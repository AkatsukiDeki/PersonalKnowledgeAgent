import React, { useEffect, useState } from 'react';
import { fetchApi } from '../api/client';
import { Folder, PlayCircle } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

export function TMADashboard({ onStartPractice }: { onStartPractice: (folder: string | null) => void }) {
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    WebApp.BackButton.hide();
    fetchApi<any>('sources/folders/tree')
      .then(res => {
        // Flatten the tree
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
        setFolders(paths);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-6">
      <div className="p-4 bg-[var(--tg-theme-secondary-bg-color)] sticky top-0 z-10 shadow-sm">
        <h1 className="text-xl font-bold text-[var(--tg-theme-text-color)]">Обзор базы знаний</h1>
      </div>

      <div className="p-4 space-y-4">
        <div 
          onClick={() => onStartPractice(null)}
          className="flex items-center justify-between p-4 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-2xl shadow-sm active:scale-95 transition-transform"
        >
          <div className="flex items-center gap-3">
            <PlayCircle className="w-6 h-6" />
            <span className="font-semibold text-lg">Вся база (Случайный спринт)</span>
          </div>
        </div>

        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--tg-theme-hint-color)] mt-6 mb-2">
          По папкам
        </h2>
        
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin h-6 w-6 border-2 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {folders.map(folder => (
              <div 
                key={folder}
                onClick={() => onStartPractice(folder)}
                className="flex flex-col p-4 bg-[var(--tg-theme-bg-color)] border border-[var(--tg-theme-hint-color)] border-opacity-20 rounded-2xl active:bg-[var(--tg-theme-secondary-bg-color)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[var(--tg-theme-secondary-bg-color)] rounded-xl">
                    <Folder className="w-5 h-5 text-[var(--tg-theme-button-color)]" />
                  </div>
                  <span className="font-medium text-[var(--tg-theme-text-color)] truncate">
                    {folder}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
