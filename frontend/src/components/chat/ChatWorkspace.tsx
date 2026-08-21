import React, { useState, useEffect, useCallback } from 'react';
import { Message, Citation, OrbitContext } from '../../types/chat';
import { streamChat } from '../../api/chat';
import { conversationsApi } from '../../api/conversations';
import { MessageView } from './MessageView';
import { Send, Loader2 } from 'lucide-react';
import { ConversationSidebar } from './ConversationSidebar';

interface Props {
  onOrbitUpdate?: (ctx: OrbitContext | null) => void;
  seedPrompt?: string | null;
  onSeedConsumed?: () => void;
}

export function ChatWorkspace({ onOrbitUpdate, seedPrompt, onSeedConsumed }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const messagesEndRef = React.useRef<HTMLDivElement| null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeConvId) {
      loadConversation(activeConvId);
    } else {
      setMessages([]);
      pushOrbit(null);
    }
  }, [activeConvId]);

  useEffect(() => {
    if (!seedPrompt) return;
    setInput(seedPrompt);
    onSeedConsumed?.();
  }, [seedPrompt, onSeedConsumed]);

  useEffect(() => {
    const handleOpenConv = (e: Event) => {
      const customEvent = e as CustomEvent;
      const convId = customEvent.detail?.conversationId;
      if (convId) {
        setActiveConvId(convId);
      }
    };
    window.addEventListener('openConversation', handleOpenConv);
    return () => window.removeEventListener('openConversation', handleOpenConv);
  }, []);

  const pushOrbit = useCallback((ctx: OrbitContext | null) => {
    onOrbitUpdate?.(ctx);
  }, [onOrbitUpdate]);

  const loadConversation = async (id: string) => {
    try {
      const data = await conversationsApi.getConversationDetail(id);

      const formatted = data.messages.map(m => {
        let r: 'user' | 'assistant' = 'user';
        if (m.role === 'assistant' || m.role === 'system') r = 'assistant';
        return {
          id: m.id,
          role: r,
          content: m.content,
          timestamp: m.created_at,
          citations: [] as Citation[],
        };
      });
      setMessages(formatted);

      // Push decisions to orbit
      pushOrbit({
        decisions: data.decisions || [],
        evidences: [],
        insights: [],
      });
    } catch (err) {
      console.error("Failed to load conversation", err);
    }
  };

  const handleNewConversation = async () => {
    try {
      const conv = await conversationsApi.createConversation("Новый диалог");
      setActiveConvId(conv.id);
    } catch (err) {
      console.error("Failed to create conversation", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isCooldown) return;

    let targetConvId = activeConvId;
    if (!targetConvId) {
      try {
        const conv = await conversationsApi.createConversation("Новый диалог");
        targetConvId = conv.id;
        setActiveConvId(conv.id);
      } catch (err) {
        console.error("Failed to create first conversation", err);
        return;
      }
    }

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
      targetConvId,
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
        // Push evidences to orbit
        pushOrbit({
          decisions: [],
          evidences: citations,
          insights: [],
        });
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

  // Handle Shift+Enter for multiline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex h-full w-full bg-transparent">
      <ConversationSidebar
        activeConversationId={activeConvId}
        onSelectConversation={setActiveConvId}
        onNewConversation={handleNewConversation}
      />

      <div className="flex flex-col flex-1 h-full bg-transparent text-slate-200 min-w-0 relative">

        {/* Message stream */}
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl w-full mx-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col gap-4 items-center justify-center text-white/40 text-sm">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-1">
                ✦
              </div>
              <p className="font-light">Задайте вопрос агенту по вашей базе знаний…</p>
              {!activeConvId && (
                <button
                  onClick={handleNewConversation}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 rounded-xl text-xs font-mono transition-all"
                >
                  [ Начать новый диалог ]
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg) => (
                <MessageView key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Loading status */}
        {loadingStatus && (
          <div className="max-w-3xl w-full mx-auto px-6 pb-2">
            <div className="flex items-center gap-2.5 text-xs text-indigo-400/80 font-mono">
              <Loader2 size={13} className="animate-spin" />
              <span>{loadingStatus}</span>
            </div>
          </div>
        )}

        {/* Glass Input Bar */}
        <div className="p-4 max-w-3xl w-full mx-auto shrink-0">
          <form
            onSubmit={handleSubmit}
            className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-end gap-3 p-3 shadow-2xl transition-all focus-within:border-white/20"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isCooldown ? 'Подождите…' : 'Введите запрос... (Shift+Enter — новая строка)'}
              disabled={isLoading || isCooldown}
              rows={1}
              className="flex-1 bg-transparent border-none text-sm text-white/90 placeholder-white/30 focus:outline-none resize-none max-h-32 py-2 px-2 disabled:opacity-40 font-light"
              style={{ minHeight: '38px' }}
            />
            <button
              type="submit"
              disabled={isLoading || isCooldown || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/20 text-white p-2.5 rounded-xl flex items-center justify-center transition-all shrink-0 shadow-lg shadow-indigo-500/20 disabled:shadow-none"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={1.5} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChatWorkspace;