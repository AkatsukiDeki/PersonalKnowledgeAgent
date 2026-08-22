import React, { useState, useRef, useEffect } from 'react';
import { Send, GraduationCap, RefreshCw, Zap, Trash2 } from 'lucide-react';
import { subjectsApi } from '../../api/subjects';
import ReactMarkdown from 'react-markdown';

interface SubjectTutorChatProps {
  subjectId: string;
  initialContext?: { id: string; title: string } | null;
  onClearContext?: () => void;
}

export const SubjectTutorChat: React.FC<SubjectTutorChatProps> = ({ subjectId, initialContext, onClearContext }) => {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    try {
      const data = await subjectsApi.getTutorHistory(subjectId);
      setMessages(data.messages || []);
    } catch (e) {
      console.error('Failed to load tutor history', e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [subjectId]);

  useEffect(() => {
    if (initialContext) {
      const autoMessage = `Давай разберем тему: ${initialContext.title}`;
      handleSendMessage(autoMessage, initialContext.title);
      if (onClearContext) onClearContext();
    }
  }, [initialContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (text: string, topicContext?: string) => {
    if (!text.trim() || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const response = await subjectsApi.sendTutorMessage(subjectId, text, topicContext);
      setMessages(prev => [...prev, { role: 'assistant', content: response.reply }]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Произошла ошибка при получении ответа.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const userMessage = input;
    setInput('');
    handleSendMessage(userMessage);
  };

  const handleClearChat = async () => {
    if (window.confirm('Вы уверены, что хотите очистить историю диалога с тьютором по этому предмету?')) {
      await subjectsApi.resetTutorChat(subjectId);
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
        <h3 className="font-bold text-white flex items-center gap-2">
          <GraduationCap className="text-indigo-400" />
          Smart Tutor
        </h3>
        
        <div className="flex bg-zinc-950 rounded-lg p-1 border border-zinc-800">
          <button
            onClick={handleClearChat}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
          >
            <Trash2 size={16} />
            Очистить чат / Новый диалог
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 mt-10">
            <GraduationCap size={48} className="mx-auto mb-4 text-zinc-700" />
            <p>Задавайте вопросы по материалам предмета.</p>
            <p className="text-sm mt-2">Тьютор использует сократовский метод: он не дает прямых ответов, а помогает вам дойти до них самостоятельно.</p>
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl p-4 ${m.role === 'user' ? 'bg-indigo-500/20 text-indigo-100 border border-indigo-500/30' : 'bg-zinc-800/50 text-slate-200 border border-zinc-700'}`}>
              <div className="prose prose-invert prose-sm">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
             <div className="max-w-[80%] rounded-2xl p-4 bg-zinc-800/50 text-slate-200 border border-zinc-700">
               <RefreshCw size={20} className="animate-spin text-indigo-400" />
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-zinc-900/50 border-t border-zinc-800">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
            placeholder={loading ? "Тьютор печатает..." : "Спросите что-нибудь..."}
            className="w-full bg-zinc-950 border border-zinc-700 text-white rounded-xl px-4 py-4 pr-12 outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 top-2 bottom-2 aspect-square bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 rounded-lg flex items-center justify-center text-white transition-colors"
          >
             <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};
