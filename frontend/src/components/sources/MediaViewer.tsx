import React, { useRef, useState, useEffect } from 'react';
import { VoiceNoteViewer } from './VoiceNoteViewer';
import { Source } from '@/types/source';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface MediaViewerProps {
  sourceId: string;
  source: Source;
  metaInfo: any;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({ sourceId, source, metaInfo }) => {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const mediaType = metaInfo.media?.media_type || 'audio';
  const mimeType = metaInfo.media?.mime_type;
  const segments = metaInfo.transcript_segments || metaInfo.media?.transcript_segments || [];
  const streamUrl = `/api/v1/media/${sourceId}/stream`;

  if (mediaType === 'voice_note') {
    return <VoiceNoteViewer source={source} sourceId={sourceId} />;
  }

  useEffect(() => {
    const handleTimeUpdate = () => {
      if (mediaRef.current) {
        setCurrentTime(mediaRef.current.currentTime);
      }
    };

    const el = mediaRef.current;
    if (el) {
      el.addEventListener('timeupdate', handleTimeUpdate);
      return () => el.removeEventListener('timeupdate', handleTimeUpdate);
    }
  }, []);

  const handleSeek = (time: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      mediaRef.current.play().catch(e => console.warn('Autoplay prevented:', e));
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="p-4 border-b border-zinc-800 shrink-0 bg-black flex justify-center">
        {mediaType === 'video' ? (
          <video
            ref={mediaRef as any}
            controls
            src={streamUrl}
            className="w-full max-w-2xl max-h-[300px] rounded-lg"
            type={mimeType}
          />
        ) : (
          <audio
            ref={mediaRef as any}
            controls
            src={streamUrl}
            className="w-full"
            type={mimeType}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-2">
          {segments.length > 0 ? (
            segments.map((seg, idx) => {
              const isActive = currentTime >= seg.start && currentTime <= seg.end;
              return (
                <div
                  key={idx}
                  onClick={() => handleSeek(seg.start)}
                  className={`group flex items-start gap-4 p-2 rounded-lg cursor-pointer transition-colors ${
                    isActive ? 'bg-indigo-900/30 border border-indigo-500/30' : 'hover:bg-zinc-900 border border-transparent'
                  }`}
                >
                  <span className={`text-[10px] font-mono mt-1 w-12 shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                    {formatTime(seg.start)}
                  </span>
                  <span className={`text-sm leading-relaxed ${isActive ? 'text-zinc-100 font-medium' : 'text-zinc-400 group-hover:text-zinc-300'}`}>
                    {seg.text}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="text-zinc-500 text-sm italic text-center mt-10">
              Караоке-субтитры недоступны для этого медиафайла.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
