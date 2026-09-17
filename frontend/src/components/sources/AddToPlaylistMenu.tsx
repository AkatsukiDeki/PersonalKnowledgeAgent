import React, { useState, useEffect, useRef } from 'react';
import { Plus, Database, Loader2, Check } from 'lucide-react';
import { playlistsApi, Playlist } from '../../api/playlists';

interface Props {
  sourceId: string;
  trigger?: React.ReactNode;
}

export function AddToPlaylistMenu({ sourceId, trigger }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchPlaylists = async () => {
    try {
      setLoading(true);
      const data = await playlistsApi.list();
      setPlaylists(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPlaylists();
      setShowNewInput(false);
      setNewTitle('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleAddToPlaylist = async (playlist: Playlist) => {
    try {
      setAddingTo(playlist.id);
      await playlistsApi.addItem(playlist.id, {
        source_id: sourceId,
        sequence_num: playlist.items.length
      });
      setTimeout(() => setIsOpen(false), 500);
    } catch (e) {
      console.error(e);
      alert('Failed to add to playlist');
    } finally {
      setAddingTo(null);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setLoading(true);
      const newPlaylist = await playlistsApi.create({ title: newTitle.trim() });
      await handleAddToPlaylist({ ...newPlaylist, items: [] });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger || (
          <button className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" title="Add to Playlist">
            <Plus size={16} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden text-sm flex flex-col">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950/50 flex items-center gap-2">
            <Database size={14} className="text-sky-400" />
            <span className="font-medium text-zinc-300">Add to Playlist</span>
          </div>

          <div className="max-h-48 overflow-y-auto p-1 flex flex-col gap-0.5">
            {loading && playlists.length === 0 ? (
              <div className="p-3 text-center text-zinc-500"><Loader2 size={14} className="animate-spin inline" /></div>
            ) : playlists.length === 0 && !showNewInput ? (
              <div className="px-3 py-2 text-zinc-500 text-xs italic">No playlists yet</div>
            ) : (
              playlists.map(p => {
                const isAdded = addingTo === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleAddToPlaylist(p)}
                    disabled={isAdded}
                    className="flex items-center justify-between px-2 py-1.5 w-full text-left rounded hover:bg-white/5 transition-colors text-zinc-300 disabled:opacity-50"
                  >
                    <span className="truncate">{p.title}</span>
                    {isAdded && <Check size={14} className="text-emerald-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="p-1 border-t border-zinc-800 bg-zinc-950/30">
            {showNewInput ? (
              <form onSubmit={handleCreateNew} className="flex flex-col gap-2 p-1">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Playlist Name"
                  className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-500/50"
                />
                <div className="flex items-center gap-1">
                  <button type="submit" disabled={!newTitle.trim()} className="flex-1 bg-sky-500/20 text-sky-400 py-1 rounded text-xs hover:bg-sky-500/30 transition disabled:opacity-50">Create</button>
                  <button type="button" onClick={() => setShowNewInput(false)} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-xs text-zinc-400 transition">Cancel</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowNewInput(true)}
                className="flex items-center gap-2 px-2 py-1.5 w-full text-left rounded hover:bg-white/5 transition-colors text-sky-400 text-xs font-medium"
              >
                <Plus size={14} /> New Playlist
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
