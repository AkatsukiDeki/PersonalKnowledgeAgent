import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../api/client';
import { FileText, Search, X } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { motion, AnimatePresence } from 'framer-motion';

export function TmaNotes() {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);

  useEffect(() => {
    fetchApi<any>('sources')
      .then(res => setSources(Array.isArray(res) ? res : (res.sources || [])))
      .catch(err => {
        console.error(err);
        WebApp.showAlert("Ошибка загрузки заметок");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--tg-theme-bg-color)]">
      <div className="p-4 bg-[var(--tg-theme-secondary-bg-color)] sticky top-0 z-10 shadow-sm border-b border-[var(--tg-theme-hint-color)] border-opacity-20 flex justify-between items-center">
        <h1 className="text-xl font-bold text-[var(--tg-theme-text-color)]">Заметки</h1>
        <Search className="w-5 h-5 text-[var(--tg-theme-button-color)]" />
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin h-6 w-6 border-2 border-[var(--tg-theme-button-color)] border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map(s => (
              <div 
                key={s.id} 
                className="p-4 bg-[var(--tg-theme-secondary-bg-color)] rounded-2xl active:scale-[0.98] transition-transform"
                onClick={() => setSelectedNote(s)}
              >
                <div className="flex gap-3">
                  <div className="mt-1">
                    <FileText className="w-5 h-5 text-[var(--tg-theme-button-color)]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--tg-theme-text-color)] truncate">{s.name}</h3>
                    <p className="text-sm text-[var(--tg-theme-hint-color)] mt-1">{s.folder || 'В корне'}</p>
                  </div>
                </div>
              </div>
            ))}
            {sources.length === 0 && (
              <div className="text-center p-8 text-[var(--tg-theme-hint-color)]">
                У вас пока нет добавленных материалов.
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Bottom Sheet */}
      <AnimatePresence>
        {selectedNote && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNote(null)}
              className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) {
                  setSelectedNote(null);
                }
              }}
              className="fixed inset-x-0 bottom-0 z-50 bg-[var(--tg-theme-bg-color)] rounded-t-3xl shadow-xl flex flex-col max-h-[85vh]"
            >
              <div className="flex justify-center p-3">
                <div className="w-12 h-1.5 bg-[var(--tg-theme-hint-color)] rounded-full opacity-30" />
              </div>
              <div className="px-6 pb-4 border-b border-[var(--tg-theme-hint-color)] border-opacity-20 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-[var(--tg-theme-text-color)]">{selectedNote.name}</h2>
                  <p className="text-sm text-[var(--tg-theme-button-color)] mt-1">{selectedNote.folder || 'В корне'}</p>
                </div>
                <button onClick={() => setSelectedNote(null)} className="p-2 rounded-full bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-hint-color)]">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <div className="prose prose-sm dark:prose-invert max-w-none text-[var(--tg-theme-text-color)]">
                  {selectedNote.summary || selectedNote.content || "Текст заметки недоступен."}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
