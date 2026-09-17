import React, { useEffect, useState } from 'react';
import { playlistsApi, Playlist, PlaylistItem } from '../api/playlists';
import { Database, Plus, Play, Trash2, GripVertical, FileAudio, FileVideo, Music } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { usePlayer } from '../context/PlayerContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortablePlaylistItem } from '../components/sources/SortablePlaylistItem';

export function PlaylistsWorkspace() {
  const { t } = useLanguage();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  
  const { playPlaylist } = usePlayer();
  
  const fetchPlaylists = async () => {
    try {
      const data = await playlistsApi.list();
      setPlaylists(data);
      if (data.length > 0 && !selectedPlaylistId) {
        setSelectedPlaylistId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const p = await playlistsApi.create({ title: newTitle.trim() });
      setNewTitle('');
      await fetchPlaylists();
      setSelectedPlaylistId(p.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    try {
      await playlistsApi.delete(id);
      if (selectedPlaylistId === id) setSelectedPlaylistId(null);
      await fetchPlaylists();
    } catch (e) {
      console.error(e);
    }
  };

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);

  // Start playing from the given item
  const handlePlay = (item: PlaylistItem, idx: number) => {
    if (!selectedPlaylist) return;
    playPlaylist(selectedPlaylist.id, idx, selectedPlaylist.items);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!selectedPlaylist) return;

    if (over && active.id !== over.id) {
      const oldIndex = selectedPlaylist.items.findIndex((item) => item.id === active.id);
      const newIndex = selectedPlaylist.items.findIndex((item) => item.id === over.id);
      
      const reorderedItems = arrayMove(selectedPlaylist.items, oldIndex, newIndex);
      
      // Optimistic update
      setPlaylists(prev => prev.map(p => 
        p.id === selectedPlaylist.id ? { ...p, items: reorderedItems } : p
      ));

      try {
        await playlistsApi.reorderItems(
          selectedPlaylist.id,
          reorderedItems.map((item) => item.id)
        );
      } catch (error) {
        console.error('Failed to save order:', error);
        // Rollback on failure
        setPlaylists(prev => prev.map(p => 
          p.id === selectedPlaylist.id ? { ...p, items: selectedPlaylist.items } : p
        ));
      }
    }
  };

  return (
    <div className="flex h-full bg-[#0a0a0a]">
      {/* Left Sidebar */}
      <div className="w-64 border-r border-white/5 flex flex-col bg-[#0f0f13]">
        <div className="p-4 border-b border-white/5 flex flex-col gap-3">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-sky-400">
            <Database size={16} /> Playlists
          </div>
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input 
              value={newTitle} 
              onChange={e => setNewTitle(e.target.value)} 
              placeholder="New Playlist..." 
              className="w-full bg-black/40 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500/50"
            />
            <button type="submit" className="p-1.5 text-sky-400 bg-sky-500/10 rounded-lg hover:bg-sky-500/20 transition">
              <Plus size={14} />
            </button>
          </form>
        </div>
        <div className="flex-1 overflow-y-auto">
          {playlists.map(p => (
            <div 
              key={p.id} 
              onClick={() => setSelectedPlaylistId(p.id)}
              className={`flex items-center justify-between px-4 py-3 cursor-pointer border-b border-white/[0.02] transition-colors ${selectedPlaylistId === p.id ? 'bg-sky-500/10 border-l-2 border-l-sky-500' : 'hover:bg-white/5'}`}
            >
              <div className="truncate text-sm text-zinc-300 font-medium">{p.title}</div>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="text-zinc-600 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPlaylist ? (
          <>
            <div className="p-6 border-b border-white/5">
              <h1 className="text-2xl font-light text-white mb-2">{selectedPlaylist.title}</h1>
              <p className="text-sm text-zinc-500 font-mono">{selectedPlaylist.items.length} items</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {selectedPlaylist.items.length === 0 ? (
                <div className="text-zinc-600 font-mono text-xs flex flex-col items-center justify-center h-40">
                  <Music size={32} className="mb-2 opacity-50" />
                  Playlist is empty. Add media from Source Manager.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={selectedPlaylist.items.map(item => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {selectedPlaylist.items.map((item, idx) => (
                        <SortablePlaylistItem 
                          key={item.id} 
                          item={item} 
                          idx={idx} 
                          onPlay={handlePlay} 
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 font-mono text-xs">
            SELECT OR CREATE A PLAYLIST
          </div>
        )}
      </div>
    </div>
  );
}
