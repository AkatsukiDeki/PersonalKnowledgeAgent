import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useActiveAudio } from './ActiveAudioContext';

interface MediaSourceSnippetProps {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  mediaType: 'audio' | 'video';
  startTime: number;
  endTime: number;
  textSnippet: string;
}

export const MediaSourceSnippet: React.FC<MediaSourceSnippetProps> = ({
  chunkId,
  sourceId,
  sourceTitle,
  mediaType,
  startTime,
  endTime,
  textSnippet,
}) => {
  const mediaRef = useRef<HTMLAudioElement | null>(null);
  const { isPlaying, requestPlay, requestStop } = useActiveAudio(chunkId);
  const [currentTime, setCurrentTime] = useState(startTime);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      requestStop();
    } else {
      if (mediaRef.current) {
        // Если курсор вышел за пределы чанка, сбрасываем на начало
        if (mediaRef.current.currentTime < startTime || mediaRef.current.currentTime >= endTime) {
          mediaRef.current.currentTime = startTime;
        }
      }
      requestPlay();
    }
  }, [isPlaying, requestPlay, requestStop, startTime, endTime]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    if (isPlaying) {
      el.play().catch(() => requestStop());
    } else {
      el.pause();
    }
  }, [isPlaying, requestStop]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const handleTimeUpdate = () => {
      setCurrentTime(el.currentTime);
      // Авто-остановка при выходе за пределы чанка
      if (el.currentTime >= endTime) {
        el.pause();
        el.currentTime = startTime;
        requestStop();
      }
    };

    el.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [endTime, startTime, requestStop]);

  return (
    <div className="flex flex-col gap-2 p-3 my-2 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs">
      <audio
        ref={mediaRef}
        src={`/api/v1/media/${sourceId}/stream`}
        preload="metadata"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px] uppercase">
            {mediaType}
          </span>
          <span className="font-medium text-zinc-200 truncate">{sourceTitle}</span>
        </div>

        <button
          onClick={togglePlay}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
            isPlaying
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30'
          }`}
        >
          <span>{isPlaying ? '⏸ Пауза' : '▶ Слушать'}</span>
          <span className="font-mono text-[11px] text-zinc-400">
            {formatTime(currentTime)} / {formatTime(endTime)}
          </span>
        </button>
      </div>

      <p className="text-zinc-400 italic line-clamp-2 pl-2 border-l-2 border-zinc-700">
        "{textSnippet}"
      </p>
    </div>
  );
};
