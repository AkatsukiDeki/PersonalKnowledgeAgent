import React, { useEffect, useState, useRef } from 'react';
import { ConversationOut, conversationsApi } from '../../api/conversations';
import { MessageSquare, Plus, Trash2, Pin, PinOff, Edit2, Check, X, Folder, ChevronDown, ChevronRight, FolderPlus, CheckSquare, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export const ConversationSidebar: React.FC<SidebarProps> = ({ activeConversationId, onSelectConversation, onNewConversation }) => {
  const { t } = useLanguage();
  const [conversations, setConversations] = useState<ConversationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  
  const [draggedConvId, setDraggedConvId] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    const savedFolders = localStorage.getItem('pka_custom_folders');
    if (savedFolders) {
      try {
        setCustomFolders(JSON.parse(savedFolders));
      } catch (e) {}
    }
    }
    // const interval = setInterval(fetchConversations, 5000);
    // return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setFolderMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addCustomFolder = (folderName: string) => {
    setCustomFolders(prev => {
      const newFolders = Array.from(new Set([...prev, folderName]));
      localStorage.setItem('pka_custom_folders', JSON.stringify(newFolders));
      return newFolders;
    });
    setOpenFolders(prev => ({ ...prev, [folderName]: true }));
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm(t('chatSidebar.confirmDelete'))) return;

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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || isBulkDeleting) return;
    if (!window.confirm(`Удалить ${selectedIds.size} выбранных диалогов?`)) return;
    setIsBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        await conversationsApi.deleteConversation(id);
      }
      setSelectedIds(new Set());
      setSelectMode(false);
      fetchConversations();
      if (activeConversationId && selectedIds.has(activeConversationId)) {
        onNewConversation();
      }
    } catch (err) {
      console.error('Failed to bulk delete', err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTogglePin = async (e: React.MouseEvent, conv: ConversationOut) => {
    e.stopPropagation();
    try {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, is_pinned: !c.is_pinned } : c));
      await conversationsApi.updateConversation(conv.id, { is_pinned: !conv.is_pinned });
      fetchConversations();
    } catch (err) {
      console.error('Failed to toggle pin', err);
      fetchConversations();
    }
  };

  const handleStartRename = (e: React.MouseEvent, conv: ConversationOut) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = async (e: React.MouseEvent | React.KeyboardEvent, conv: ConversationOut) => {
    e.stopPropagation();
    if (!editTitle.trim() || editTitle === conv.title) {
      setEditingId(null);
      return;
    }
    
    try {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, title: editTitle.trim() } : c));
      setEditingId(null);
      await conversationsApi.updateConversation(conv.id, { title: editTitle.trim() });
      fetchConversations();
    } catch (err) {
      console.error('Failed to rename', err);
      fetchConversations();
    }
  };

  const handleMoveToFolder = async (e: React.MouseEvent | null, convId: string, folderName: string | null) => {
    if (e) e.stopPropagation();
    try {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, folder: folderName } : c));
      setFolderMenuOpen(null);
      if (folderName) {
        addCustomFolder(folderName);
      }
      await conversationsApi.updateConversation(convId, { folder: folderName });
      fetchConversations();
    } catch (err) {
      console.error('Failed to move to folder', err);
      fetchConversations();
    }
  };

  const handleCreateNewFolderGlobal = () => {
    const newFolderName = window.prompt(t('chatSidebar.promptNewFolder'));
    if (newFolderName && newFolderName.trim()) {
      addCustomFolder(newFolderName.trim());
    }
  };

  const handleCreateNewFolderForConv = (e: React.MouseEvent, conv: ConversationOut) => {
    e.stopPropagation();
    const newFolderName = window.prompt(t('chatSidebar.promptNewFolder'));
    if (newFolderName && newFolderName.trim()) {
      handleMoveToFolder(e, conv.id, newFolderName.trim());
    } else {
      setFolderMenuOpen(null);
    }
  };

  const toggleFolder = (folderName: string) => {
    setOpenFolders(prev => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  // Drag and Drop Handlers
  const onDragStart = (e: React.DragEvent, convId: string) => {
    setDraggedConvId(convId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDropConv = async (e: React.DragEvent, targetConv: ConversationOut) => {
    e.preventDefault();
    if (!draggedConvId || draggedConvId === targetConv.id) return;

    // We dropped a conversation onto another conversation
    // If target has a folder, move dragged to that folder
    if (targetConv.folder) {
      handleMoveToFolder(null, draggedConvId, targetConv.folder);
    } else {
      // Otherwise, create a new folder for both
      const newFolderName = window.prompt(t('chatSidebar.promptMergeFolder'));
      if (newFolderName && newFolderName.trim()) {
        const folder = newFolderName.trim();
        addCustomFolder(folder);
        await conversationsApi.updateConversation(draggedConvId, { folder });
        await conversationsApi.updateConversation(targetConv.id, { folder });
        fetchConversations();
      }
    }
    setDraggedConvId(null);
  };

  const onDropFolder = (e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    if (!draggedConvId) return;
    handleMoveToFolder(null, draggedConvId, folderName);
    setDraggedConvId(null);
  };

  const groupConversations = () => {
    const groups = {
      pinned: [] as ConversationOut[],
      folders: {} as Record<string, ConversationOut[]>,
      today: [] as ConversationOut[],
      yesterday: [] as ConversationOut[],
      last7: [] as ConversationOut[],
      older: [] as ConversationOut[],
    };

    // Initialize custom folders
    customFolders.forEach(f => {
      if (!groups.folders[f]) groups.folders[f] = [];
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfLast7 = new Date(startOfToday);
    startOfLast7.setDate(startOfLast7.getDate() - 7);

    conversations.forEach(c => {
      if (c.is_pinned) {
        groups.pinned.push(c);
        return;
      }
      if (c.folder) {
        if (!groups.folders[c.folder]) {
          groups.folders[c.folder] = [];
          addCustomFolder(c.folder);
        }
        groups.folders[c.folder].push(c);
        return;
      }
      const d = new Date(c.created_at || new Date());
      if (d >= startOfToday) {
        groups.today.push(c);
      } else if (d >= startOfYesterday) {
        groups.yesterday.push(c);
      } else if (d >= startOfLast7) {
        groups.last7.push(c);
      } else {
        groups.older.push(c);
      }
    });

    return groups;
  };

  const renderConversation = (conv: ConversationOut) => {
    const isActive = activeConversationId === conv.id;
    return (
      <div
        key={conv.id}
        draggable
        onDragStart={(e) => onDragStart(e, conv.id)}
        onDragOver={onDragOver}
        onDrop={(e) => onDropConv(e, conv)}
        onClick={() => {
          if (selectMode) {
            toggleSelect(conv.id);
          } else if (editingId !== conv.id) {
            onSelectConversation(conv.id);
          }
        }}
        className={`relative group flex items-center justify-between p-2 cursor-pointer transition-all duration-150 rounded-lg border overflow-visible ${
          isActive
            ? 'bg-indigo-500/15 border-indigo-500/30 border-l-2 border-l-indigo-400 text-white shadow-sm shadow-indigo-500/10'
            : 'border-transparent hover:bg-white/5 text-zinc-400 opacity-60 hover:opacity-100'
        } ${draggedConvId === conv.id ? 'opacity-30' : ''}`}
      >
        <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
          {selectMode ? (
            <input 
              type="checkbox" 
              checked={selectedIds.has(conv.id)} 
              readOnly 
              className="shrink-0 rounded border-zinc-700 bg-black/40 checked:bg-indigo-600/80 checked:border-indigo-400 focus:ring-0 w-3.5 h-3.5 cursor-pointer appearance-none transition-all relative after:content-[''] after:absolute after:hidden checked:after:block after:left-1 after:top-[1px] after:w-1.5 after:h-2.5 after:border-r-[2px] after:border-b-[2px] after:border-white after:rotate-45"
            />
          ) : conv.is_pinned ? (
            <Pin size={13} className="shrink-0 text-entity-insight fill-entity-insight/30" />
          ) : (
            <MessageSquare size={13} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
          )}
          
          {editingId === conv.id ? (
            <input
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename(e, conv);
                if (e.key === 'Escape') setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-black/50 text-[11px] font-medium text-white px-1 py-0.5 rounded outline-none border border-white/20 w-full"
            />
          ) : (
            <span className="truncate text-[11px] font-medium" onDoubleClick={(e) => handleStartRename(e, conv)}>{conv.title}</span>
          )}
        </div>
        
        <div className="opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all flex items-center shrink-0 ml-1">
          {editingId === conv.id ? (
            <>
              <button onClick={(e) => handleSaveRename(e, conv)} className="p-1 hover:bg-white/[0.06] rounded text-emerald-400">
                <Check size={11} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1 hover:bg-white/[0.06] rounded text-zinc-400">
                <X size={11} />
              </button>
            </>
          ) : (
            <>
              {/* Folder Menu */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setFolderMenuOpen(folderMenuOpen === conv.id ? null : conv.id); }}
                  className={`p-1 hover:bg-white/[0.06] rounded transition-all ${folderMenuOpen === conv.id ? 'text-indigo-400 bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title={t('chatSidebar.folder')}
                >
                  <Folder size={11} />
                </button>
                {folderMenuOpen === conv.id && (
                  <div ref={menuRef} className="absolute right-0 top-full mt-1 w-40 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                    <div className="px-2 py-1 border-b border-white/10 text-[10px] text-white/40 uppercase tracking-wider">{t('chatSidebar.moveTo')}</div>
                    {customFolders.map(folder => (
                      <button
                        key={folder}
                        onClick={(e) => handleMoveToFolder(e, conv.id, folder)}
                        className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors flex items-center justify-between ${conv.folder === folder ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/80 hover:bg-white/10'}`}
                      >
                        <span className="truncate">{folder}</span>
                        {conv.folder === folder && <Check size={10} />}
                      </button>
                    ))}
                    {conv.folder && (
                      <button
                        onClick={(e) => handleMoveToFolder(e, conv.id, null)}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-white/50 hover:bg-white/10 transition-colors"
                      >
                        {t('chatSidebar.removeFromFolder')}
                      </button>
                    )}
                    <div className="h-px bg-white/10 my-1"></div>
                    <button
                      onClick={(e) => handleCreateNewFolderForConv(e, conv)}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-indigo-400 hover:bg-indigo-500/10 transition-colors flex items-center gap-2"
                    >
                      <Plus size={10} /> {t('chatSidebar.createNewFolder')}
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={(e) => handleStartRename(e, conv)}
                className="p-1 hover:bg-white/[0.06] rounded transition-all text-zinc-500 hover:text-zinc-300"
                title={t('chatSidebar.rename')}
              >
                <Edit2 size={11} />
              </button>
              <button
                onClick={(e) => handleTogglePin(e, conv)}
                className="p-1 hover:bg-white/[0.06] rounded transition-all text-zinc-500 hover:text-zinc-300"
                title={conv.is_pinned ? t('chatSidebar.unpin') : t('chatSidebar.pin')}
              >
                {conv.is_pinned ? <PinOff size={11} /> : <Pin size={11} />}
              </button>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                className="p-1 hover:bg-white/[0.06] rounded transition-all text-zinc-500 hover:text-entity-conflict"
                title={t('chatSidebar.delete')}
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (title: string, convs: ConversationOut[]) => {
    if (convs.length === 0) return null;

    return (
      <div className="mb-4">
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-3 mb-1.5">{title}</h3>
        <div className="space-y-0.5">
          {convs.map(conv => renderConversation(conv))}
        </div>
      </div>
    );
  };

  const grouped = groupConversations();

  return (
    <div className="w-72 sm:w-64 bg-[#0a0a0c]/95 sm:bg-surface-low backdrop-blur-3xl sm:bg-transparent sm:backdrop-blur-none border-r border-white/5 flex flex-col h-full text-zinc-100 shrink-0 fixed inset-y-0 left-0 sm:relative z-[100] sm:z-40 select-none shadow-2xl sm:shadow-none transition-transform duration-300">
      <div className="p-3 flex gap-2">
        <button
          onClick={onNewConversation}
          className="flex-1 flex items-center gap-2 justify-center py-2 px-3 bg-entity-decision/10 hover:bg-entity-decision/20 border border-entity-decision/20 text-entity-decision rounded-lg transition-colors font-medium text-xs shadow-lg shadow-entity-decision/5"
        >
          <Plus size={14} />
          {t('chatSidebar.newDialog')}
        </button>
        <button
          onClick={() => {
            setSelectMode(!selectMode);
            if (selectMode) setSelectedIds(new Set());
          }}
          className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${selectMode ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200'}`}
          title="Режим массового удаления"
        >
          <CheckSquare size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pt-3 pb-3 relative">
        {loading && conversations.length === 0 ? (
          <div className="text-center text-[11px] text-zinc-600 mt-4">{t('chatSidebar.loading')}</div>
        ) : (
          <>
            {renderGroup(t('chatSidebar.pinned'), grouped.pinned)}
            
            {/* Folders */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-3 mb-1.5">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{t('chatSidebar.folders')}</h3>
                <button
                  onClick={handleCreateNewFolderGlobal}
                  className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-white/5 transition-colors"
                  title={t('chatSidebar.createFolderTooltip')}
                >
                  <FolderPlus size={12} />
                </button>
              </div>
              
              <div className="space-y-1">
                {customFolders.length === 0 && (
                  <div className="px-3 py-2 text-[10px] text-zinc-600 text-center border border-dashed border-white/5 rounded-lg">
                    {t('chatSidebar.noFolders')}
                  </div>
                )}
                
                {Object.entries(grouped.folders).map(([folderName, convs]) => (
                  <div 
                    key={folderName} 
                    className="mb-1"
                    onDragOver={onDragOver}
                    onDrop={(e) => onDropFolder(e, folderName)}
                  >
                    <button
                      onClick={() => toggleFolder(folderName)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 group text-left rounded-lg transition-colors border ${
                        draggedConvId ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-transparent hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {openFolders[folderName] ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                        <Folder size={12} className="text-indigo-400 opacity-80" />
                        <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">{folderName}</span>
                      </div>
                      <span className="text-[9px] text-zinc-500 font-mono px-1.5 py-0.5 bg-black/20 rounded">{convs.length}</span>
                    </button>
                    {openFolders[folderName] && (
                      <div className="pl-4 pr-1 mt-1 space-y-0.5 border-l border-white/5 ml-3 pb-1">
                        {convs.length > 0 ? (
                          convs.map(conv => renderConversation(conv))
                        ) : (
                          <div className="text-[10px] text-zinc-600 italic py-1 pl-2">{t('chatSidebar.emptyFolder')}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Time groups */}
            {renderGroup(t('chatSidebar.today'), grouped.today)}
            {renderGroup(t('chatSidebar.yesterday'), grouped.yesterday)}
            {renderGroup(t('chatSidebar.last7days'), grouped.last7)}
            {renderGroup(t('chatSidebar.older'), grouped.older)}
            
            {conversations.length === 0 && (
              <div className="text-center text-[11px] text-zinc-600 mt-4">{t('chatSidebar.noDialogs')}</div>
            )}
          </>
        )}
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="p-3 border-t border-white/5 bg-[#0a0a0a]">
          <button 
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded-lg border border-red-500/30 transition-colors"
          >
            {isBulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Удалить ({selectedIds.size})
          </button>
        </div>
      )}
    </div>
  );
};
