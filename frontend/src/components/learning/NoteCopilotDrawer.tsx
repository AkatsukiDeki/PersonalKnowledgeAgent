import React, { useState, useRef, useEffect } from 'react';
import { useNoteCopilot } from '../../hooks/useNoteCopilot';

interface NoteCopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  scope: any;
  topicId: string;
  roadmapPayload: any;
  topicTitle: string;
}

export const NoteCopilotDrawer: React.FC<NoteCopilotDrawerProps> = ({
  isOpen,
  onClose,
  scope,
  topicId,
  roadmapPayload,
  topicTitle,
}) => {
  const { messages, sendMessage, isLoading } = useNoteCopilot();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input, {
      scope,
      topic_id: topicId,
      roadmap_payload: roadmapPayload,
    });
    setInput('');
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col z-50 text-slate-100">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
        <div>
          <h3 className="font-semibold text-sm">Копилот по конспекту</h3>
          <p className="text-xs text-slate-400 truncate max-w-[260px]">{topicTitle}</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-sm p-1 rounded transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm mt-12">
            Задайте вопрос по текущей теме. Наставник ответит строго на основе материалов конспекта.
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-200 border border-slate-700'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-950 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Спросить по теме..."
          disabled={isLoading}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
        >
          ➤
        </button>
      </form>
    </div>
  );
};
