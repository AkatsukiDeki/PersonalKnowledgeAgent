import React, { useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

interface CustomMediaControlsProps {
  mediaRef: React.RefObject<HTMLMediaElement>;
}

export const CustomMediaControls: React.FC<CustomMediaControlsProps> = ({ mediaRef }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onLoadedMetadata = () => setDuration(el.duration);
    const onVolumeChange = () => setMuted(el.muted);

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('volumechange', onVolumeChange);

    setIsPlaying(!el.paused);
    setCurrentTime(el.currentTime);
    setDuration(el.duration || 0);
    setMuted(el.muted);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('volumechange', onVolumeChange);
    };
  }, [mediaRef]);

  const togglePlay = () => {
    if (mediaRef.current) {
      if (isPlaying) mediaRef.current.pause();
      else mediaRef.current.play();
    }
  };

  const toggleMute = () => {
    if (mediaRef.current) {
      mediaRef.current.muted = !mediaRef.current.muted;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mediaRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      const newTime = pos * duration;
      mediaRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Generate deterministic pseudo-waveform heights
  const [waveformHeights, setWaveformHeights] = useState<number[]>([]);
  useEffect(() => {
    const bars = 80;
    const heights = [];
    let seed = 12345;
    for (let i = 0; i < bars; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const rnd = seed / 233280;
      // create a nice varying envelope
      const envelope = Math.sin((i / bars) * Math.PI) * 0.5 + 0.5;
      heights.push(Math.max(10, Math.floor(rnd * 100 * envelope)));
    }
    setWaveformHeights(heights);
  }, []);

  return (
    <div className="flex items-center gap-3 p-3 bg-[#0a0a0e]/80 backdrop-blur-xl border border-white/10 rounded-xl w-full">
      <button onClick={togglePlay} className="p-2 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 transition-colors active:scale-95 border border-indigo-500/20">
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      
      <div className="text-[11px] font-mono text-zinc-400 w-10 text-right">
        {formatTime(currentTime)}
      </div>

      <div 
        className="flex-1 h-8 flex items-center justify-between gap-[2px] cursor-pointer group"
        onClick={handleSeek}
      >
        {waveformHeights.map((h, i) => {
          const progress = duration > 0 ? currentTime / duration : 0;
          const barProgress = i / waveformHeights.length;
          const isActive = barProgress <= progress;
          
          return (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-150 ${
                isActive 
                  ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' 
                  : 'bg-white/10 group-hover:bg-white/20'
              }`}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      
      <div className="text-[11px] font-mono text-zinc-500 w-10 text-left">
        {formatTime(duration)}
      </div>

      <button onClick={toggleMute} className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors active:scale-95 bg-white/5 hover:bg-white/10 rounded-lg border border-transparent hover:border-white/10">
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
    </div>
  );
};
