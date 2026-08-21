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
    <div className="w-56 bg-surface-low border-r border-surface-border flex flex-col h-full text-zinc-100 shrink-0">
      <div className="p-2.5">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center gap-2 justify-center py-2 px-3 bg-entity-decision/20 hover:bg-entity-decision/30 border border-entity-decision/30 text-entity-decision rounded-lg transition-colors font-medium text-xs"
        >
          <Plus size={14} />
          Новый чат
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3 space-y-0.5">
        {loading && conversations.length === 0 ? (
          <div className="text-center text-[11px] text-zinc-600 mt-4">Загрузка…</div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-[11px] text-zinc-600 mt-4">Нет диалогов</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`group flex items-center justify-between p-2 cursor-pointer rounded-lg transition-all duration-150 ${
                activeConversationId === conv.id
                  ? 'bg-white/[0.06] text-zinc-200'
                  : 'hover:bg-white/[0.04] text-zinc-500'
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden min-w-0">
                <MessageSquare size={13} className="shrink-0 opacity-60" />
                <span className="truncate text-[11px] font-medium">{conv.title}</span>
              </div>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/[0.06] rounded transition-all text-zinc-600 hover:text-entity-conflict shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
