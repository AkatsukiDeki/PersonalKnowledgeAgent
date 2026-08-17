import React, { useState } from 'react';
import { Message, Citation } from '../../types/chat';
import { streamChat } from '../../api/chat';
import { MessageView } from './MessageView';
import { Send } from 'lucide-react';

export function ChatWorkspace() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isCooldown) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const assistantId = crypto.randomUUID();
    const botPlaceholder: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      citations: [],
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    const history = messages
      .filter((m) => !m.isStreaming && m.content.trim())
      .slice(-4)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, botPlaceholder]);
    setInput('');
    setIsLoading(true);

    let streamBuffer = '';
    let currentCitations: Citation[] = [];

    await streamChat(
      userMsg.content,
      history,
      (status) => {
        setLoadingStatus(status);
      },
      (citations) => {
        currentCitations = citations;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, citations } : msg
          )
        );
      },
      (token) => {
        streamBuffer += token;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, content: streamBuffer } : msg
          )
        );
      },
      (error) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: `Ошибка: ${error}`, isStreaming: false }
              : msg
          )
        );
        setIsLoading(false);
        setLoadingStatus('');
        setIsCooldown(true);
        setTimeout(() => setIsCooldown(false), 2500);
      },
      () => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: streamBuffer, citations: currentCitations, isStreaming: false }
              : msg
          )
        );
        setIsLoading(false);
        setLoadingStatus('');
        setIsCooldown(true);
        setTimeout(() => setIsCooldown(false), 2500);
      }
    );
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      <div className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
            Задайте вопрос агенту по вашей базе знаний...
          </div>
        ) : (
          messages.map((msg) => <MessageView key={msg.id} message={msg} />)
        )}
      </div>

      {loadingStatus && (
        <div className="max-w-3xl w-full mx-auto px-4 pb-2 text-xs text-emerald-500/70 font-medium animate-pulse">
          {loadingStatus}
        </div>
      )}

      <div className="p-4 border-t border-zinc-800 max-w-3xl w-full mx-auto">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isCooldown ? 'Подождите...' : 'Введите запрос...'}
            disabled={isLoading || isCooldown}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 disabled:opacity-50 transition-all"
          />
          <button
            type="submit"
            disabled={isLoading || isCooldown || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-center transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatWorkspace;