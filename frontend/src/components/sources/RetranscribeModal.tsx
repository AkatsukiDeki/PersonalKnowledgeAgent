import React, { useState } from 'react';
import { X, RefreshCw, Loader2 } from 'lucide-react';

interface RetranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (lang: string, prompt: string) => Promise<void>;
  isLoading: boolean;
}

export const RetranscribeModal: React.FC<RetranscribeModalProps> = ({ isOpen, onClose, onConfirm, isLoading }) => {
  const [lang, setLang] = useState('ru');
  const [prompt, setPrompt] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-zinc-100 flex items-center gap-2">
            <RefreshCw size={18} className="text-orange-400" />
            Перезапустить транскрибацию
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Это удалит текущий транскрипт и все выделенные концепты. Будет запущен новый анализ оригинального медиафайла.
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Язык распознавания</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500/50"
            >
              <option value="ru">Русский (ru)</option>
              <option value="en">English (en)</option>
              <option value="auto">Автоопределение (auto)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Специфический промпт (опционально)</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Например: термины, имена собственные..."
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
          >
            Отмена
          </button>
          <button
            onClick={() => onConfirm(lang, prompt)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Запустить анализ
          </button>
        </div>
      </div>
    </div>
  );
};
