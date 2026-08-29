import React, { useState, useEffect, useCallback } from 'react';
import { Message, Citation, OrbitContext } from '../../types/chat';
import { streamChat } from '../../api/chat';
import { conversationsApi } from '../../api/conversations';
import { MessageView } from './MessageView';
import { Send, Loader2, Paperclip, X, Sparkles, PanelLeft, PanelLeftClose } from 'lucide-react';
import { ConversationSidebar } from './ConversationSidebar';
import { sourcesApi } from '../../api/sources';
import { profileApi } from '../../api/profile';
import { ChatModeSelector } from './ChatModeSelector';
import { ChatMode, LearningContext } from '../../types/chat';

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('');

  const [chatMode, setChatMode] = useState<ChatMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('pka_chat_mode') as ChatMode) || 'vault';
    }
    return 'vault';
  });
  const [learningContext, setLearningContext] = useState<LearningContext | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem('pka_chat_mode', chatMode);
  }, [chatMode]);

  const [activeConvId, setActiveConvId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pka_active_conv_id');
    }
    return null;
  });
  const [isSeeded, setIsSeeded] = useState(false);

  const [attachedFiles, setAttachedFiles] = useState<{id: string, name: string}[]>([]);
  const [attachedImage, setAttachedImage] = useState<{
    file: File;
    previewUrl: string;
    base64: string;
    mimeType: string;
  } | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const skipLoadRef = React.useRef(false);

  const messagesEndRef = React.useRef<HTMLDivElement| null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeConvId) {
      localStorage.setItem('pka_active_conv_id', activeConvId);
      if (skipLoadRef.current) {
        skipLoadRef.current = false;
      } else {
        loadConversation(activeConvId);
      }
    } else {
      localStorage.removeItem('pka_active_conv_id');
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
    
    const handleInjectPrompt = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setInput(customEvent.detail);
      }
    };
    
    const handleOpenChatContext = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        if (customEvent.detail.chatMode) setChatMode(customEvent.detail.chatMode);
        if (customEvent.detail.learningContext) setLearningContext(customEvent.detail.learningContext);
      }
    };
    
    window.addEventListener('openConversation', handleOpenConv);
    window.addEventListener('injectChatPrompt', handleInjectPrompt);
    window.addEventListener('openChatWithContext', handleOpenChatContext);
    
    // Check if user is already seeded
    profileApi.getProfile().then(profile => {
      if (profile && profile.is_seeded) {
        setIsSeeded(true);
      }
    }).catch(err => console.error("Failed to fetch profile", err));
    
    return () => {
      window.removeEventListener('openConversation', handleOpenConv);
      window.removeEventListener('injectChatPrompt', handleInjectPrompt);
      window.removeEventListener('openChatWithContext', handleOpenChatContext);
    };
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
          image_base64: m.image_base64 || undefined,
          image_mime_type: m.image_mime_type || undefined,
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

  const handleSubmit = async (e: React.FormEvent, overrideInput?: string) => {
    e.preventDefault();
    const textToSend = overrideInput !== undefined ? overrideInput : input;
    
    // Allow empty text only if there's an attached image or file
    if ((!textToSend.trim() && !attachedImage && attachedFiles.length === 0) || isLoading || isCooldown) return;

    let targetConvId = activeConvId;
    if (!targetConvId) {
      try {
        const titleText = textToSend.trim() || 'Изображение';
        const optimisticTitle = titleText.substring(0, 35) + (titleText.length > 35 ? '...' : '');
        const conv = await conversationsApi.createConversation(optimisticTitle);
        targetConvId = conv.id;
        skipLoadRef.current = true;
        setActiveConvId(conv.id);
      } catch (err) {
        console.error("Failed to create first conversation", err);
        return;
      }
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date().toISOString(),
      image_base64: attachedImage?.base64,
      image_mime_type: attachedImage?.mimeType,
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

    const sourceIds = attachedFiles.map(f => f.id);
    const imagePayload = attachedImage;
    
    setAttachedFiles([]);
    setAttachedImage(null);
    
    await streamChat(
      userMsg.content,
      history,
      targetConvId,
      sourceIds,
      (convId) => {
        if (!activeConvId) {
          setActiveConvId(convId);
        }
      },
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
      },
      chatMode,
      learningContext,
      'assistant',
      imagePayload?.base64,
      imagePayload?.mimeType
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleImageAttach = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(',')[1];
      setAttachedImage({
        file,
        previewUrl: result,
        base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleImageAttach(file);
      } else {
        await handleFileUpload(file);
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) handleImageAttach(file);
        break;
      }
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const source = await sourcesApi.upload(file);
      setAttachedFiles(prev => [...prev, { id: source.id, name: file.name }]);
    } catch (err) {
      console.error("Failed to upload file", err);
      alert("Ошибка при загрузке файла");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-transparent">
      {isSidebarOpen && (
        <ConversationSidebar
          activeConversationId={activeConvId}
          onSelectConversation={setActiveConvId}
          onNewConversation={handleNewConversation}
        />
      )}

      <div 
        className="flex flex-col flex-1 h-full min-w-0 relative text-slate-200 overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Cosmic Background */}
        <div className="absolute inset-0 pointer-events-none z-0 bg-[#030308]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#05050a]/80 to-[#020205]" />
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(1px 1px at 25px 25px, white, transparent), radial-gradient(1px 1px at 75px 75px, white, transparent), radial-gradient(1.5px 1.5px at 120px 40px, #a5b4fc, transparent), radial-gradient(1.5px 1.5px at 40px 120px, #c4b5fd, transparent)', backgroundSize: '200px 200px' }} />
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(1px 1px at 10px 150px, white, transparent), radial-gradient(1px 1px at 170px 10px, white, transparent), radial-gradient(2px 2px at 150px 150px, #818cf8, transparent)', backgroundSize: '250px 250px' }} />
        </div>

        {isDragging && (
          <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-sm border-2 border-dashed border-indigo-500/50 flex items-center justify-center rounded-2xl m-4">
            <p className="text-indigo-400 font-medium text-lg">Перетащите файл сюда для загрузки</p>
          </div>
        )}

        {/* Action Header */}
        <div className="absolute top-6 left-6 z-20">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 backdrop-blur-md border border-indigo-500/30 text-indigo-300 rounded-xl transition-colors shadow-lg"
            title="Переключить боковую панель"
          >
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>

        {activeConvId && messages.length > 0 && (
          <div className="absolute top-6 right-8 z-20">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('focusNode', { detail: activeConvId }))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 backdrop-blur-md border border-indigo-500/30 text-indigo-300 text-xs font-medium rounded-xl transition-colors shadow-lg"
              title="Показать на карте Вселенной"
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline">В Galaxy</span>
            </button>
          </div>
        )}

        {/* Message stream */}
        <div 
          className="flex-1 overflow-y-auto pt-24 w-full scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative z-10"
          style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 80px, black 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 80px, black 100%)' }}
        >
          <div className="max-w-3xl w-full mx-auto px-6 h-full">
            {messages.length === 0 ? (
              !isSeeded && (
                <div className="h-full flex flex-col gap-6 items-center justify-center text-white/60 text-sm">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2">
                    🪐
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl text-white font-medium">Welcome to Universe 2.0</h2>
                    <p className="font-light max-w-sm">База знаний пуста. Чтобы агент мог понимать ваш контекст, давайте проведем начальную настройку (Primary Seed).</p>
                  </div>
                  {!activeConvId && (
                    <button
                      onClick={(e) => {
                        const seedText = 'Привет! Давай проведем базовую настройку (Primary Seed). Расскажи, какие данные тебе нужны для старта?';
                        setInput(seedText);
                        handleSubmit(e as any, seedText);
                      }}
                      className="px-6 py-2.5 bg-indigo-600/80 hover:bg-indigo-500 text-white border border-indigo-500/50 rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-500/20"
                    >
                      Начать инициализацию (Primary Seed)
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <MessageView key={msg.id} message={msg} />
                ))}
                {/* Spacer so the last message is pushed above the input bar when scrolling to the end */}
                <div className="h-40 shrink-0" />
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
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
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-3xl w-[calc(100%-3rem)] shrink-0 z-10 flex flex-col items-start">
          
          <ChatModeSelector 
            value={chatMode} 
            onChange={setChatMode} 
            learningSubject={learningContext?.subject_name}
            onClearSubject={() => {
              setLearningContext(undefined);
              if (chatMode === 'learning') setChatMode('vault');
            }}
          />

          {(attachedFiles.length > 0 || attachedImage) && (
            <div className="flex flex-wrap gap-2 mb-2 px-1">
              {attachedFiles.map(file => (
                <div key={file.id} className="flex items-center gap-1.5 bg-indigo-500/20 text-indigo-200 text-xs px-2.5 py-1 rounded-md border border-indigo-500/30">
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button onClick={() => setAttachedFiles(prev => prev.filter(f => f.id !== file.id))} className="hover:text-white transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {attachedImage && (
                <div className="relative group bg-[#111116]/80 backdrop-blur-xl border border-indigo-500/20 rounded-xl p-1.5 flex items-center gap-3">
                  <img src={attachedImage.previewUrl} alt="Preview" className="w-10 h-10 object-cover rounded-lg border border-white/5" />
                  <div className="flex flex-col mr-6">
                    <span className="text-[11px] font-medium text-white/90 truncate max-w-[150px]">{attachedImage.file.name}</span>
                    <span className="text-[9px] text-white/40 uppercase font-mono">{(attachedImage.file.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    className="absolute top-1.5 right-1.5 w-4 h-4 bg-black/60 hover:bg-red-500/80 text-white rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
            </div>
          )}
          
          <form
            id="chat-input-form"
            onSubmit={handleSubmit}
            className="w-full bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-end gap-3 p-3 shadow-2xl transition-all focus-within:border-white/20"
          >
            <input 
              type="file" 
              accept="image/*"
              ref={fileInputRef} 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleImageAttach(e.target.files[0]);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-white/40 hover:text-white/80 transition-colors p-2 shrink-0 disabled:opacity-50"
            >
              {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={isCooldown ? 'Подождите…' : 'Введите запрос... (Shift+Enter — новая строка, Ctrl+V — картинка)'}
              disabled={isLoading || isCooldown}
              rows={1}
              className="flex-1 bg-transparent border-none text-sm text-white/90 placeholder-white/30 focus:outline-none resize-none max-h-32 py-2 px-2 disabled:opacity-40 font-light scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent [&::-webkit-scrollbar-button]:hidden"
              style={{ minHeight: '38px' }}
            />
            <button
              type="submit"
              onClick={handleSubmit}
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