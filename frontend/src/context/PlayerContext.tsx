import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { PlaylistItem } from '../api/playlists';
import { playlistsApi } from '../api/playlists';

interface ActivePlaylistContext {
  playlistId: string;
  currentIndex: number;
  items: PlaylistItem[];
}

interface PlayerContextType {
  currentSourceId: string | null;
  activePlaylist: ActivePlaylistContext | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  
  playSource: (sourceId: string) => void;
  playPlaylist: (playlistId: string, startIndex: number, items: PlaylistItem[]) => void;
  pause: () => void;
  resume: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  clearPlayer: () => void;
  
  // Expose audio ref for other components if needed
  audioRef: React.RefObject<HTMLAudioElement>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<ActivePlaylistContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  
  const audioRef = useRef<HTMLAudioElement>(null!);
  const consecutiveErrorsRef = useRef(0);

  // Sync state with actual audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      consecutiveErrorsRef.current = 0; // Reset on successful play
    };
    const handleDurationChange = () => setDuration(audio.duration);
    const handlePlay = () => {
      setIsPlaying(true);
      consecutiveErrorsRef.current = 0;
    };
    const handlePause = () => setIsPlaying(false);
    
    const handleError = () => {
      if (activePlaylist) {
        consecutiveErrorsRef.current += 1;
        if (consecutiveErrorsRef.current >= activePlaylist.items.length) {
          pause();
          clearPlayer();
          // Use alert or custom toast here
          alert('Не удалось воспроизвести треки из плейлиста');
        } else {
          nextTrack();
        }
      } else {
        clearPlayer();
        alert('Cannot play track');
      }
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      nextTrack();
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [activePlaylist, currentSourceId]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (!currentSourceId) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) pause();
        else resume();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          nextTrack();
        } else if (audioRef.current) {
          audioRef.current.currentTime += 5;
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          prevTrack();
        } else if (audioRef.current) {
          audioRef.current.currentTime -= 5;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSourceId, isPlaying]);

  const updateBackendLastPlayed = async (playlistId: string, itemId: string) => {
    try {
      await playlistsApi.update(playlistId, { last_played_item_id: itemId });
    } catch (e) {
      console.warn("Failed to update last played item", e);
    }
  };

  const playSource = (sourceId: string) => {
    setActivePlaylist(null);
    setCurrentSourceId(sourceId);
  };

  const playPlaylist = (playlistId: string, startIndex: number, items: PlaylistItem[]) => {
    if (items.length === 0 || startIndex >= items.length) return;
    
    setActivePlaylist({ playlistId, currentIndex: startIndex, items });
    setCurrentSourceId(items[startIndex].source_id);
    updateBackendLastPlayed(playlistId, items[startIndex].id);
  };

  const pause = () => {
    audioRef.current?.pause();
  };

  const resume = () => {
    audioRef.current?.play().catch(err => console.warn("Autoplay blocked:", err));
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  const clearPlayer = () => {
    pause();
    setCurrentSourceId(null);
    setActivePlaylist(null);
    setCurrentTime(0);
    setDuration(0);
  };

  const nextTrack = () => {
    // Note: use the ref/functional state update if activePlaylist closure is stale,
    // but useEffect dependencies re-bind this correctly when it changes.
    setActivePlaylist(prev => {
      if (prev) {
        const nextIdx = prev.currentIndex + 1;
        if (nextIdx < prev.items.length) {
          const nextItem = prev.items[nextIdx];
          setCurrentSourceId(nextItem.source_id);
          updateBackendLastPlayed(prev.playlistId, nextItem.id);
          return { ...prev, currentIndex: nextIdx };
        } else {
          // End of playlist
          setCurrentSourceId(null);
          return null;
        }
      }
      setCurrentSourceId(null);
      return null;
    });
  };

  const prevTrack = () => {
    setActivePlaylist(prev => {
      if (prev) {
        const prevIdx = prev.currentIndex - 1;
        if (prevIdx >= 0) {
          const prevItem = prev.items[prevIdx];
          setCurrentSourceId(prevItem.source_id);
          updateBackendLastPlayed(prev.playlistId, prevItem.id);
          return { ...prev, currentIndex: prevIdx };
        }
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      return prev;
    });
  };

  return (
    <PlayerContext.Provider
      value={{
        currentSourceId,
        activePlaylist,
        isPlaying,
        currentTime,
        duration,
        volume,
        playSource,
        playPlaylist,
        pause,
        resume,
        nextTrack,
        prevTrack,
        seek,
        setVolume,
        clearPlayer,
        audioRef
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
