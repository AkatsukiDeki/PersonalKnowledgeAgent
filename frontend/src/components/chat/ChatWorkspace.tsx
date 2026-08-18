import React, { useState, useEffect } from 'react';
import { Message, Citation } from '../../types/chat';
import { streamChat } from '../../api/chat';
import { conversationsApi } from '../../api/conversations';
import { MessageView } from './MessageView';
import { Send } from 'lucide-react';
import { ConversationSidebar } from './ConversationSidebar';
import { ConversationMemory, Decision } from '../../types/chat';
import { ConversationExperiencePanel } from './ConversationExperiencePanel';

export function ChatWorkspace() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [memory, setMemory] = useState<ConversationMemory | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showExperiencePanel, setShowExperiencePanel] = useState(true);

  useEffect(() => {
    if (activeConvId) {
      loadConversation(activeConvId);
    } else {
      setMessages([]);
      setMemory(null);
      setDecisions([]);
    }
  }, [activeConvId]);

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

  const loadConversation = async (id: string) => {
    try {
      const data = await conversationsApi.getConversationDetail(id);
      
      setMemory(data.memory || null);
      setDecisions(data.decisions || []);
      
      const formatted = data.messages.map(m => {
        let r: 'user' | 'assistant' = 'user';
        if (m.role === 'assistant' || m.role === 'system') r = 'assistant';
        return {
          id: m.id,
          role: r,
          content: m.content,
          timestamp: m.created_at,
          citations: [] // TODO: Load citations if needed
        };
      });
      setMessages(formatted);
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
    <div className="flex h-full w-full">
      <ConversationSidebar 
        activeConversationId={activeConvId}
        onSelectConversation={setActiveConvId}
        onNewConversation={handleNewConversation}
      />
      <div className="flex flex-col flex-1 h-full bg-zinc-950 text-zinc-100 min-w-0">
        
        {/* Header */}
        {activeConvId && (memory || decisions.length > 0) && (
          <div className="h-12 border-b border-zinc-800 flex items-center justify-end px-4 shrink-0">
            <button 
              onClick={() => setShowExperiencePanel(!showExperiencePanel)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${showExperiencePanel ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
            >
              {showExperiencePanel ? 'Скрыть опыт' : 'Показать опыт'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col gap-4 items-center justify-center text-zinc-500 text-sm">
              <p>Задайте вопрос агенту по вашей базе знаний...</p>
              {!activeConvId && (
                <button onClick={handleNewConversation} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded shadow-sm text-xs transition-colors">
                  Начать новый диалог
                </button>
              )}
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

        <div className="p-4 border-t border-zinc-800 max-w-3xl w-full mx-auto shrink-0">
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
      
      {showExperiencePanel && (memory || decisions.length > 0) && (
        <ConversationExperiencePanel memory={memory} decisions={decisions} />
      )}
    </div>
  );
}

export default ChatWorkspace;