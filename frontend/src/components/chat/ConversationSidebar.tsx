import React, { useEffect, useState } from 'react';
import { ConversationOut, conversationsApi } from '../../api/conversations';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export const ConversationSidebar: React.FC<SidebarProps> = ({ activeConversationId, onSelectConversation, onNewConversation }) => {
  const [conversations, setConversations] = useState<ConversationOut[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const data = await conversationsApi.getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [activeConversationId]); 

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Удалить этот диалог?")) return;
    
    try {
      await conversationsApi.deleteConversation(id);
      fetchConversations();
      if (activeConversationId === id) {
        onNewConversation(); 
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    }
  };

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full text-zinc-100 shrink-0">
      <div className="p-3">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center gap-2 justify-center py-2 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors font-medium text-xs text-white shadow-xs"
        >
          <Plus size={16} />
          Новый чат
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {loading && conversations.length === 0 ? (
          <div className="text-center text-xs text-zinc-500 mt-4">Загрузка...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-xs text-zinc-500 mt-4">Нет диалогов</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`group flex items-center justify-between p-2.5 cursor-pointer rounded-lg transition-colors ${
                activeConversationId === conv.id ? 'bg-zinc-800 text-emerald-400' : 'hover:bg-zinc-800/50 text-zinc-400'
              }`}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <MessageSquare size={14} className="shrink-0 opacity-70" />
                <span className="truncate text-xs font-medium">{conv.title}</span>
              </div>
              <button 
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-all text-zinc-500 hover:text-red-400 shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
