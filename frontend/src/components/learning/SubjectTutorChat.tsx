import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Loader2, GraduationCap, Award, Terminal, FileText, type LucideIcon } from 'lucide-react';
import { streamChat } from '../../api/chat';
import type { Message, ToolState } from '../../types/chat';
import { InteractiveCodeLab } from './InteractiveCodeLab';
import { VerdictWidget } from './VerdictWidget';
import { SandboxTerminalWidget } from '../chat/SandboxTerminalWidget';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';

type TutorMode = 'mentor' | 'examiner' | 'coder' | 'summary';

interface ModeConfig {
  id: TutorMode;
  label: string;
  icon: LucideIcon;
  desc: string;
  color: string;
}

const MODES: ModeConfig[] = [
  { id: 'mentor',   label: 'Ментор',      icon: GraduationCap, desc: 'Сократовский диалог',    color: 'indigo' },
  { id: 'examiner', label: 'Экзаменатор', icon: Award,         desc: 'Проверка на прочность',   color: 'rose'   },
  { id: 'coder',    label: 'Кодер',       icon: Terminal,      desc: 'Практика и песочница',    color: 'emerald'},
  { id: 'summary',  label: 'Конспект',    icon: FileText,      desc: 'Выжимка и тезисы',        color: 'amber'  },
];

const MODE_COLOR_CLASSES: Record<string, { active: string; hover: string; icon: string }> = {
  indigo:  { active: 'bg-indigo-500/15 border-indigo-500/50 text-indigo-300',  hover: 'hover:bg-indigo-500/10 hover:border-indigo-500/30', icon: 'text-indigo-400'  },
  rose:    { active: 'bg-rose-500/15 border-rose-500/50 text-rose-300',         hover: 'hover:bg-rose-500/10 hover:border-rose-500/30',    icon: 'text-rose-400'    },
  emerald: { active: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300',hover: 'hover:bg-emerald-500/10 hover:border-emerald-500/30',icon: 'text-emerald-400'},
  amber:   { active: 'bg-amber-500/15 border-amber-500/50 text-amber-300',      hover: 'hover:bg-amber-500/10 hover:border-amber-500/30',  icon: 'text-amber-400'   },
};

interface Props {
  subjectId: string;
  initialContext?: { id: string; title: string } | null;
  onClearContext?: () => void;
}

export const SubjectTutorChat: React.FC<Props> = ({ subjectId, initialContext, onClearContext }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tutorMode, setTutorMode] = useState<TutorMode>('mentor');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        const topicId = initialContext?.id || 'general';
        const baseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';
        const url = `${baseUrl}/subjects/${subjectId}/tutor/messages?topic_id=${topicId}&mode=${tutorMode}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const apiKey = import.meta.env.VITE_PKA_API_KEY;
        if (apiKey) {
          headers['X-API-Key'] = apiKey;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) return;

        const data = await response.json();
        if (!isMounted) return;

        const historyMessages: Message[] = (data.messages || []).map((m: any) => ({
          id: m.id || crypto.randomUUID(),
          role: m.role,
          content: m.content,
          timestamp: m.created_at || new Date().toISOString(),
        }));

        setMessages(historyMessages);
      } catch (err) {
        console.error('Error fetching tutor history:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [subjectId, tutorMode, initialContext?.id]);

  const handleAnalyzeCode = (codeToAnalyze: string, stdoutStr: string, stderrStr: string) => {
    const errorText = stderrStr || stdoutStr;
    const promptText = `Помоги разобраться. Я запустил код:\n\`\`\`python\n${codeToAnalyze}\n\`\`\`\nПолучил вывод:\n\`\`\`\n${errorText}\n\`\`\``;
    setTimeout(() => {
      void handleSend(promptText);
    }, 0);
  };

  const handleSend = async (textOverride?: string) => {
    const textToUse = typeof textOverride === 'string' ? textOverride : input;
    if (!textToUse.trim() || isLoading) return;

    let userText = textToUse.trim();
    if (initialContext && !textOverride) {
      userText = `[Контекст: ${initialContext.title}]\n${userText}`;
      if (onClearContext) onClearContext();
    }
    if (!textOverride) {
      setInput('');
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userText,
      timestamp: new Date().toISOString(),
    };

    const assistantMsgId = crypto.randomUUID();
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      toolStates: [],
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, initialAssistantMsg]);
    setIsLoading(true);

    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      await streamChat(
        userText,
        history,
        null,
        [],
        () => {},
        () => {},
        () => {},
        (token: string) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMsgId ? { ...msg, content: msg.content + token } : msg
            )
          );
        },
        (toolData: any) => {
          setMessages(prev =>
            prev.map(msg => {
              if (msg.id !== assistantMsgId) return msg;
              const newState: ToolState = {
                id: toolData.execution_id || Date.now().toString(),
                tool_name: toolData.tool_name,
                status: 'running',
                script: toolData.args?.script || toolData.script || '',
              };
              return { ...msg, toolStates: [...(msg.toolStates || []), newState] };
            })
          );
        },
        (resultData: any) => {
          setMessages(prev =>
            prev.map(msg => {
              if (msg.id !== assistantMsgId) return msg;
              const states = msg.toolStates || [];
              const targetId = resultData.execution_id;
              const idx = targetId ? states.findIndex((t: ToolState) => t.id === targetId) : states.length - 1;
              if (idx >= 0) {
                const updated = [...states];
                updated[idx] = {
                  ...updated[idx],
                  status: resultData.status === 'success' ? 'success' : 'error',
                  stdout: resultData.result?.stdout || resultData.stdout,
                  stderr: resultData.result?.stderr || resultData.stderr || resultData.error,
                };
                return { ...msg, toolStates: updated };
              }
              return msg;
            })
          );
        },
        (_error: string) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + '\n\n*(Ошибка соединения с сервером)*', isStreaming: false }
                : msg
            )
          );
        },
        () => {
          setMessages(prev =>
            prev.map(msg => msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg)
          );
        },
        () => {},
        'learning',
        { subject_id: subjectId, mode: tutorMode, topic_id: initialContext?.id || 'general' }
      );
    } catch {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMsgId
            ? { ...msg, content: msg.content + '\n\n*(Ошибка соединения с сервером)*', isStreaming: false }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const activeModeConfig = MODES.find(m => m.id === tutorMode)!;
  const activeColors = MODE_COLOR_CLASSES[activeModeConfig.color];

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 rounded-xl border border-zinc-800/80 overflow-hidden">
      {/* Панель режимов */}
      <div className="flex gap-1.5 px-3 pt-3 pb-2 border-b border-zinc-800/60 bg-zinc-900/40">
        {MODES.map(mode => {
          const Icon = mode.icon;
          const colors = MODE_COLOR_CLASSES[mode.color];
          const isActive = tutorMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setTutorMode(mode.id)}
              title={mode.desc}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all',
                isActive
                  ? colors.active
                  : `border-zinc-800 text-zinc-500 bg-transparent ${colors.hover}`
              )}
            >
              <Icon className={clsx('w-3.5 h-3.5', isActive ? colors.icon : 'text-zinc-500')} />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center text-xs text-zinc-500 italic truncate max-w-[140px]">
          {activeModeConfig.desc}
        </div>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm gap-3">
            <div className={clsx(
              'w-12 h-12 rounded-2xl border flex items-center justify-center',
              activeColors.active
            )}>
              <activeModeConfig.icon className={clsx('w-6 h-6', activeColors.icon)} />
            </div>
            <div className="text-center">
              <p className="font-medium text-zinc-300">{activeModeConfig.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{activeModeConfig.desc}</p>
            </div>
            {initialContext && (
              <p className="text-xs text-indigo-400">
                Контекст: <strong>{initialContext.title}</strong>
              </p>
            )}
          </div>
        ) : (
          messages.map(msg => {
            let displayContent = msg.content;
            let extractedScore: number | null = null;
            if (msg.role === 'assistant' && tutorMode === 'examiner') {
              const verdictMatch = displayContent.match(/\[VERDICT:\s*SCORE\s*=\s*(\d{1,3})]/i);
              if (verdictMatch) {
                extractedScore = parseInt(verdictMatch[1], 10);
                displayContent = displayContent.replace(verdictMatch[0], '');
              }
            }

            return (
              <div key={msg.id} className={clsx('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className={clsx(
                    'w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5',
                    activeColors.active
                  )}>
                    <activeModeConfig.icon className={clsx('w-3.5 h-3.5', activeColors.icon)} />
                  </div>
                )}
                <div className={clsx(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-zinc-900/90 border border-zinc-800 text-zinc-200 rounded-bl-none prose prose-invert prose-sm max-w-none'
                )}>
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code(props) {
                          const { children, className, node, ...rest } = props;
                          const match = /language-(\w+)/.exec(className || '');
                          const lang = match?.[1];
                          if (lang === 'python' || lang === 'sql') {
                            return (
                              <InteractiveCodeLab
                                initialCode={String(children).replace(/\n$/, '')}
                                language={lang}
                                onAnalyze={handleAnalyzeCode}
                              />
                            );
                          }
                          return <code {...rest} className={clsx(className, "bg-zinc-800 px-1 py-0.5 rounded text-xs")}>{children}</code>;
                        }
                      }}
                    >
                      {displayContent}
                    </ReactMarkdown>
                  )}
                  {extractedScore !== null && (
                    <VerdictWidget score={extractedScore} />
                  )}
                  {msg.isStreaming && msg.role === 'assistant' && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-400 rounded-sm animate-pulse align-middle" />
                  )}
                  {msg.toolStates && msg.toolStates.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.toolStates.map(exec => (
                        <SandboxTerminalWidget key={exec.id} tool={exec} />
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-zinc-400" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="p-3 bg-zinc-900/60 border-t border-zinc-800/80">
        {initialContext && (
          <div className="mb-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-xs text-indigo-300 flex items-center justify-between">
            <span>Контекст: <strong>{initialContext.title}</strong></span>
            <button onClick={onClearContext} className="text-indigo-400 hover:text-white ml-2 text-sm leading-none">×</button>
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); void handleSend(); }} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              tutorMode === 'mentor'   ? 'Задайте вопрос — разберём вместе...' :
              tutorMode === 'examiner' ? 'Готовы к сложному кейсу?' :
              tutorMode === 'coder'    ? 'Опишите задачу или вставьте код...' :
                                         'Что нужно структурировать в конспект?'
            }
            disabled={isLoading}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};