import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { VoiceNoteViewer } from './VoiceNoteViewer';
import { Source } from '../../types/source';
import { CustomMediaControls } from './CustomMediaControls';
import { useSourceTranslation } from '../../hooks/useSourceTranslation';

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
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [langMode, setLangMode] = useState<'orig' | 'ru'>('orig');

  const { isTranslating, translatedText, startTranslation } = useSourceTranslation();

  const mediaType = metaInfo?.media?.media_type || 'audio';
  const rawSegments: TranscriptSegment[] = metaInfo?.transcript_segments || metaInfo?.media?.transcript_segments || [];
  const streamUrl = `/api/v1/media/${sourceId}/stream`;

  if (mediaType === 'voice_note') {
    return <VoiceNoteViewer source={source} sourceId={sourceId} />;
  }

  useEffect(() => {
    const handleTimeUpdate = () => {
      const media = mediaRef.current;
      if (media) {
        setCurrentTime(media.currentTime);
      }
    };

    const el = mediaRef.current;
    if (el) {
      el.addEventListener('timeupdate', handleTimeUpdate);
      return () => el.removeEventListener('timeupdate', handleTimeUpdate);
    }
  }, []);

  const handleSeek = (time: number) => {
    const media = mediaRef.current;
    if (media) {
      media.currentTime = time;
      media.play().catch(e => console.warn('Autoplay prevented:', e));
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const parseTimestampedTranscript = (text: string): TranscriptSegment[] => {
    if (!text) return [];

    // Очистка от markdown-блоков, если модель вернула ```text ... ```
    const cleanRaw = text.replace(/```[\w]*\n?/g, '').trim();
    const lines = cleanRaw.split('\n');
    const parsed: TranscriptSegment[] = [];

    // Поддерживает [00:02], [0:02], 00:02, 0:02, (00:02), 0:02 - и т.д.
    const timeRegex = /(?:\[|\()?\b(\d{1,2}):(\d{2})(?:\.\d+)?(?:\b|\)|\]|-|\s)/;

    lines.forEach((line) => {
      const match = line.match(timeRegex);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const start = mins * 60 + secs;
        const cleanText = line.replace(timeRegex, '').replace(/^[:\s-]+/, '').trim();
        if (cleanText) {
          parsed.push({ start, end: start + 4, text: cleanText });
        }
      } else if (line.trim() && parsed.length > 0) {
        parsed[parsed.length - 1].text += ` ${line.trim()}`;
      }
    });

    return parsed;
  };

  const cachedTranslation = metaInfo?.translations?.ru || source?.meta_info?.translations?.ru || source?.metadata_info?.translations?.ru;
  const activeRussianText = translatedText || cachedTranslation;

  const displaySegments = useMemo(() => {
    if (langMode === 'ru' && activeRussianText) {
      const parsed = parseTimestampedTranscript(activeRussianText);
      if (parsed.length > 0) return parsed;
    }
    return rawSegments;
  }, [langMode, activeRussianText, rawSegments]);

  const handleToggleLanguage = (mode: 'orig' | 'ru') => {
    setLangMode(mode);
    if (mode === 'ru' && !activeRussianText && !isTranslating) {
      startTranslation(sourceId, 'ru');
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="p-4 border-b border-zinc-800 shrink-0 bg-[#0a0a0e] flex flex-col items-center justify-center gap-3">
        {mediaType === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={streamUrl}
            className="w-full max-w-2xl max-h-[300px] rounded-xl border border-zinc-800/50"
          />
        ) : (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={streamUrl}
            className="hidden"
          />
        )}

        <div className="w-full max-w-2xl flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Транскрипт & Таймкоды
            </span>
            <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => handleToggleLanguage('orig')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  langMode === 'orig'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Оригинал
              </button>
              <button
                type="button"
                onClick={() => handleToggleLanguage('ru')}
                disabled={isTranslating}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                  langMode === 'ru'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {isTranslating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Languages className="w-3 h-3" />
                )}
                Русский
              </button>
            </div>
          </div>

          <CustomMediaControls mediaRef={mediaRef} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-2">
          {displaySegments.length > 0 ? (
            displaySegments.map((seg: TranscriptSegment, idx: number) => {
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
          ) : langMode === 'ru' && isTranslating ? (
            <div className="flex flex-col items-center justify-center gap-2 text-zinc-400 text-sm py-12">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span>Выполняется потоковый перевод транскрипта...</span>
            </div>
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
