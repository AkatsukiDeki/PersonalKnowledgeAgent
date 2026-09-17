import React, { useEffect, useState } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import { Play, Pause, SkipForward, SkipBack, X, Volume2, Loader2 } from 'lucide-react';
import { sourcesApi, SourceDetail } from '../../api/sources';

export function GlobalAudioPlayer() {
  const { 
    currentSourceId, 
    activePlaylist, 
    isPlaying, 
    currentTime, 
    duration, 
    audioRef, 
    pause, 
    resume, 
    nextTrack, 
    prevTrack, 
    seek,
    clearPlayer
  } = usePlayer();

  const [sourceData, setSourceData] = useState<SourceDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentSourceId) {
      setLoading(true);
      sourcesApi.getSourceDetail(currentSourceId)
        .then(res => setSourceData(res))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setSourceData(null);
    }
  }, [currentSourceId]);

  // Handle autoplay when source changes
  useEffect(() => {
    if (currentSourceId && audioRef.current) {
      // Small timeout to let source set
      setTimeout(() => {
        audioRef.current?.play().catch(err => console.warn("Autoplay blocked:", err));
      }, 100);
    }
  }, [currentSourceId, audioRef]);

  if (!currentSourceId) return null;

  const streamUrl = `/api/v1/media/${currentSourceId}/stream`;

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - bounds.left) / bounds.width;
    seek(percent * duration);
  };

  return (
    <>
      <audio ref={audioRef} src={streamUrl} />
      
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-[#0a0a0e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-50 animate-in slide-in-from-bottom-10 fade-in flex flex-col overflow-hidden">
        
        {/* Progress Bar */}
        <div 
          className="h-1.5 w-full bg-white/5 cursor-pointer group relative"
          onClick={handleProgressBarClick}
        >
          <div 
            className="h-full bg-sky-500 relative transition-all duration-100 ease-linear"
            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-md transform translate-x-1/2" />
          </div>
        </div>

        <div className="flex items-center justify-between p-3 px-4 gap-4">
          
          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="text-sm font-medium text-zinc-200 truncate">
              {loading ? <Loader2 size={14} className="animate-spin inline mr-2 text-zinc-500" /> : sourceData?.title || 'Unknown Audio'}
            </div>
            {activePlaylist && (
              <div className="text-[10px] uppercase tracking-wider text-sky-400 font-mono flex items-center gap-2 mt-0.5">
                Playlist Playing • {activePlaylist.currentIndex + 1} / {activePlaylist.items.length}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 shrink-0">
            <button 
              onClick={prevTrack}
              className="p-2 text-zinc-400 hover:text-white transition rounded-full hover:bg-white/5"
            >
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button 
              onClick={isPlaying ? pause : resume}
              className="p-3 bg-white text-black hover:scale-105 transition rounded-full shadow-lg"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
            </button>
            <button 
              onClick={nextTrack}
              className="p-2 text-zinc-400 hover:text-white transition rounded-full hover:bg-white/5"
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
          </div>

          {/* Time & Close */}
          <div className="flex-1 flex justify-end items-center gap-4 shrink-0">
            <div className="text-xs font-mono text-zinc-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
            <div className="w-px h-6 bg-white/10" />
            <button 
              onClick={clearPlayer}
              className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition"
            >
              <X size={18} />
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
