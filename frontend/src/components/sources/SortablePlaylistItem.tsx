import React, { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Play } from 'lucide-react';
import { PlaylistItem } from '../../api/playlists';
import { sourcesApi, SourceDetail } from '../../api/sources';

interface SortablePlaylistItemProps {
  item: PlaylistItem;
  idx: number;
  onPlay: (item: PlaylistItem, idx: number) => void;
}

export const SortablePlaylistItem = ({ item, idx, onPlay }: SortablePlaylistItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [sourceData, setSourceData] = useState<SourceDetail | null>(null);
  
  useEffect(() => {
    sourcesApi.getSourceDetail(item.source_id)
      .then(res => setSourceData(res))
      .catch(() => {}); // handle silently
  }, [item.source_id]);

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border hover:bg-white/[0.04] transition group ${isDragging ? 'border-sky-500/50 z-50 bg-white/[0.05]' : 'border-white/5'}`}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="text-zinc-600 cursor-grab opacity-50 group-hover:opacity-100 hover:text-white"
      >
        <GripVertical size={16} />
      </div>
      <div className="w-8 text-center text-xs font-mono text-zinc-500">{idx + 1}</div>
      <div className="flex-1 truncate text-sm text-zinc-300">
        {sourceData?.title || item.source_id}
      </div>
      <button 
        onClick={() => onPlay(item, idx)}
        className="p-2 rounded-full bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 opacity-0 group-hover:opacity-100 transition"
      >
        <Play size={14} className="ml-0.5" />
      </button>
    </div>
  );
};
