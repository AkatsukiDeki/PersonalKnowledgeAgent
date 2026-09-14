import React, { useState } from 'react';
import { fetchApi } from '../../api/client';
import { Target, CheckCircle2 } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

export function TmaFocus() {
  const [focus, setFocus] = useState<string | null>(null);

  const handleSetFocus = () => {
    const userId = WebApp.initDataUnsafe?.user?.id;
    if (!userId) {
      WebApp.showAlert("Ошибка: не удалось определить пользователя Telegram.");
      return;
    }
    // Call backend to set context for telegram bot
    fetchApi('auth/bot/scope', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, folder_name: focus })
    })
      .then(() => {
        WebApp.HapticFeedback.notificationOccurred('success');
        WebApp.showAlert(`Фокус установлен на: ${focus || 'Вся база'}`);
      })
      .catch(() => WebApp.showAlert("Ошибка установки фокуса"));
  };

  return (
    <div className="flex flex-col h-full bg-[var(--tg-theme-bg-color)]">
      <div className="p-4 bg-[var(--tg-theme-secondary-bg-color)] sticky top-0 z-10 shadow-sm border-b border-[var(--tg-theme-hint-color)] border-opacity-20">
        <h1 className="text-xl font-bold text-[var(--tg-theme-text-color)]">Рабочий фокус</h1>
      </div>
      
      <div className="p-6 flex flex-col items-center justify-center flex-1 space-y-6">
        <div className="w-20 h-20 bg-[var(--tg-theme-button-color)] bg-opacity-10 rounded-full flex items-center justify-center mb-4">
          <Target className="w-10 h-10 text-[var(--tg-theme-button-color)]" />
        </div>
        
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[var(--tg-theme-text-color)]">Текущий фокус</h2>
          <p className="text-[var(--tg-theme-hint-color)] mt-2">
            Задайте папку, по которой бот будет отвечать на ваши вопросы в чате.
          </p>
        </div>

        <button 
          onClick={() => { setFocus(null); handleSetFocus(); }}
          className="w-full p-4 bg-[var(--tg-theme-secondary-bg-color)] rounded-2xl flex items-center justify-between mt-8 active:scale-95 transition-transform"
        >
          <span className="font-semibold text-[var(--tg-theme-text-color)]">Вся база знаний</span>
          {!focus && <CheckCircle2 className="w-6 h-6 text-green-500" />}
        </button>
      </div>
    </div>
  );
}
