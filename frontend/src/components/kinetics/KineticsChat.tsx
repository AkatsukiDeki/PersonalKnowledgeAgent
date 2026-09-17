import React, { useState } from 'react';
import { Send, Zap, ActivitySquare, Bot, User, RefreshCw, BookOpen } from 'lucide-react';
import { kineticsApi, WorkoutPlan } from '../../api/kinetics';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
}

interface KineticsChatProps {
  currentPlan: WorkoutPlan | null;
  location?: 'Дом' | 'Зал';
  onPlanMutated: (newPlan: WorkoutPlan) => void;
  onOpenJournal?: () => void;
}

export const KineticsChat: React.FC<KineticsChatProps> = ({ currentPlan, location, onPlanMutated, onOpenJournal }) => {
  const [query, setQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'ai',
      text: 'Биомеханический контур активен. План тренировки откалиброван под текущий вес и утомление. Какие параметры скорректировать?',
    },
  ]);

  const handleSend = async (textToSend: string) => {
    const cleanText = textToSend.trim();
    if (!cleanText || isTyping) return;

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: cleanText };
    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setIsTyping(true);

    try {
      const updatedPlan = await kineticsApi.askCoach(cleanText, currentPlan?.id ?? '');
      onPlanMutated(updatedPlan);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: updatedPlan.ai_rationale || 'Протокол успешно обновлен с учетом ваших ограничений.',
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error('Ошибка терминала тренера:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: 'Ошибка связи с ядром Kinetics Core. Проверьте соединение с бэкендом.',
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#030712] border border-cyan-950/80 rounded-xl overflow-hidden font-mono select-none">
      {/* Кнопка быстрого добавления статьи в терминале */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-xs font-mono shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-slate-200">AI COACH</span>
          <span className="text-[9px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
            ONLINE
          </span>
        </div>

        <button
          onClick={onOpenJournal}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-800 text-cyan-300 text-[10px] transition-colors"
          title="Открыть исследования и научные источники"
        >
          <BookOpen className="w-3 h-3 text-cyan-400" />
          <span>ИСТОЧНИКИ</span>
        </button>
      </div>

      {/* Лента сообщений */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 text-xs ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.sender === 'ai' && <Bot className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />}
            <div
              className={`p-2.5 rounded-lg max-w-[85%] leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-100'
                  : 'bg-[#090d16] border border-slate-800 text-slate-300'
              }`}
            >
              {m.text}
            </div>
            {m.sender === 'user' && <User className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />}
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-xs text-cyan-400/80 animate-pulse">
            <Zap className="w-3.5 h-3.5 animate-spin" /> Пересчет кинематики и адаптация плана...
          </div>
        )}
      </div>

      {/* Быстрые команды-подсказки */}
      <div className="p-2 border-t border-slate-800/80 bg-[#090d16] flex flex-wrap gap-1.5 shrink-0">
        {[
          'Снизь интенсивность на 20%',
          'Исключи осевую нагрузку на спину',
          'Замени становую на гиперэкстензию',
          'Добавь пресс в конец',
        ].map((cmd, i) => (
          <button
            key={i}
            onClick={() => handleSend(cmd)}
            disabled={isTyping}
            className="text-[10px] px-2 py-1 bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 hover:bg-cyan-950/30 text-slate-300 rounded transition-all disabled:opacity-50"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Инпут ввода запроса */}
      <div className="p-2.5 bg-[#030712] border-t border-slate-800 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(query);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Спросить тренера или изменить протокол..."
            disabled={isTyping}
            className="flex-1 bg-[#090d16] border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={!query.trim() || isTyping}
            className="p-2 bg-cyan-950 text-cyan-400 border border-cyan-800 rounded hover:bg-cyan-900 disabled:opacity-40 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
